import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordAgentContextService } from './discord-agent-context.service';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { AgentActionRendererService } from './agent-action-renderer.service';
import { GeminiProvider } from './providers/gemini.provider';
import { AiProvider } from './interfaces/ai-provider.interface';
import { AgentActionRecommendation } from './agent-action.types';

const DEFAULT_SYSTEM_PROMPT = `Anda adalah AI Moderator Copilot untuk Discord server bernama nio.
Tugas Anda adalah membantu moderator manusia menganalisis data pengguna (user context) dan menyarankan tindakan moderasi yang tepat.

Anda diberikan context data berupa JSON yang berisi:
1. "member": status saat ini, roles, join date, status timeout.
2. "warnings": riwayat pelanggaran pengguna (aktif/expired, alasan, batas warning threshold).
3. "recentMessages": histori pesan terbaru pengguna lintas channel di server ini.

Aturan Analisis:
- Periksa detail pelanggaran di "warnings". Jika active warnings mendekati atau melebihi threshold, Anda sangat disarankan untuk merekomendasikan TIMEOUT.
- Analisis pesan terbaru di "recentMessages" untuk mendeteksi tanda-mana pelanggaran baru (seperti spam berulang, link phishing, kata-kata kasar, flood).
- Berikan analisis singkat dan objektif dalam bahasa Indonesia pada field "summary".
- Jangan lakukan tindakan moderasi langsung. Berikan rekomendasi tindakan moderasi lewat field "recommendations".

Format output wajib berupa JSON murni dengan struktur berikut:
{
  "summary": "Analisis singkat, detail pelanggaran, dan kesimpulan untuk moderator manusia.",
  "recommendations": [
    {
      "type": "WARN",
      "reason": "Alasan spesifik warning, maksimum 512 karakter."
    },
    {
      "type": "TIMEOUT",
      "durationMinutes": 10,
      "reason": "Alasan timeout, maksimum 512 karakter."
    }
  ]
}

Ketentuan Pembatasan:
- Hanya gunakan type "WARN" atau "TIMEOUT" pada rekomendasi.
- Jika pengguna tidak melanggar aturan dan tidak perlu tindakan, kosongkan array "recommendations".
- Jangan pernah menyertakan markdown syntax seperti \`\`\`json atau teks pembuka/penutup lain. Kembalikan raw JSON saja.`;

export type AgentResponsePayload = {
  content: string;
  embeds?: any[];
  components?: any[];
};

@Injectable()
export class DiscordAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextService: DiscordAgentContextService,
    private readonly proposals: AgentActionProposalService,
    private readonly renderer: AgentActionRendererService,
  ) {}

  async handleMention(
    guildId: string,
    channelId: string,
    authorId: string,
    rawContent: string,
  ): Promise<AgentResponsePayload | null> {
    const settings = await this.prisma.discordAgentSettings.findUnique({
      where: { guildId },
    });

    const isGlobalEnabled = process.env.DISCORD_AGENT_ENABLED === 'true';
    const isEnabled = settings?.enabled ?? isGlobalEnabled;

    if (!isEnabled) return null;

    const allowedUsers = settings?.allowedUserIds?.length
      ? settings.allowedUserIds
      : (process.env.DISCORD_AGENT_ALLOWED_USER_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);

    if (!allowedUsers.includes(authorId)) {
      return null;
    }

    if (settings?.allowedChannelIds?.length && !settings.allowedChannelIds.includes(channelId)) {
      return null;
    }

    const targetMatch = rawContent.match(/<@!?(\d{17,20})>/g);
    let targetUserId: string | null = null;

    const botId = process.env.DISCORD_CLIENT_ID;
    if (targetMatch) {
      for (const mention of targetMatch) {
        const id = mention.replace(/[^0-9]/g, '');
        if (id !== botId && id !== authorId) {
          targetUserId = id;
          break;
        }
      }
    }

    let prompt = rawContent;
    if (botId) {
      prompt = prompt.replace(new RegExp(`<@!?${botId}>`, 'g'), '');
    }
    prompt = prompt.trim();

    let context = {};
    if (targetUserId) {
      context = await this.contextService.buildModContext(guildId, targetUserId);
    } else {
      context = { note: 'No target user was specified in this request.' };
    }

    const providerName = settings?.provider || process.env.DISCORD_AGENT_PROVIDER || 'gemini';
    const modelName = settings?.model || process.env.DISCORD_AGENT_MODEL || 'gemini-2.5-flash';
    const systemPrompt = settings?.systemPrompt || DEFAULT_SYSTEM_PROMPT;

    const provider = this.getProvider(providerName, modelName);

    let rawResponse = '';
    let status = 'SUCCESS';
    let errorMsg: string | null = null;

    try {
      rawResponse = await provider.generate(systemPrompt, prompt, JSON.stringify(context, null, 2));
    } catch (err: any) {
      status = 'FAILED';
      errorMsg = err.message || 'Unknown error during AI generation';
      rawResponse = '⚠️ Maaf, terjadi kesalahan saat memproses permintaan AI.';
    }

    const parsed = this.parseAgentResponse(rawResponse);
    let responseText = parsed.summary;

    if (responseText.length > 1900) {
      responseText = `${responseText.slice(0, 1880)}\n\n*(Truncated due to length limits)*`;
    }

    let embeds: any[] | undefined = undefined;
    let components: any[] | undefined = undefined;

    if (status === 'SUCCESS' && targetUserId && parsed.recommendations.length > 0) {
      try {
        const primaryRecommendation = parsed.recommendations[0];
        const proposal = await this.proposals.createProposal({
          guildId,
          channelId,
          requestedById: authorId,
          targetUserId,
          recommendation: primaryRecommendation,
        });

        // Also create any secondary proposals in the background (up to 3 total)
        for (const recommendation of parsed.recommendations.slice(1, 3)) {
          await this.proposals.createProposal({
            guildId,
            channelId,
            requestedById: authorId,
            targetUserId,
            recommendation,
          }).catch(() => null);
        }

        const rendered = this.renderer.renderProposalMessage(proposal);
        embeds = rendered.embeds;
        components = rendered.components;
        responseText += `\n\n*Proposal created: ${proposal.actionType} (${proposal.id})*`;
      } catch (err: any) {
        responseText += `\n\n*(Failed to create action proposals: ${err.message || err})*`;
      }
    }

    await this.prisma.agentInteractionLog.create({
      data: {
        guildId,
        channelId,
        userId: authorId,
        targetUserId,
        prompt,
        response: status === 'SUCCESS' ? rawResponse : null,
        status,
        error: errorMsg,
      },
    }).catch(() => null);

    return {
      content: responseText,
      ...(embeds ? { embeds } : {}),
      ...(components ? { components } : {}),
    };
  }

  private parseAgentResponse(raw: string): { summary: string; recommendations: AgentActionRecommendation[] } {
    try {
      const parsed = JSON.parse(raw);
      const recommendations = Array.isArray(parsed.recommendations)
        ? parsed.recommendations
            .filter((item: any) => item?.type === 'WARN' || item?.type === 'TIMEOUT')
            .map((item: any) => ({
              type: item.type as 'WARN' | 'TIMEOUT',
              reason: String(item.reason || '').slice(0, 512) || 'AI recommended moderation action.',
              durationMinutes: item.type === 'TIMEOUT' ? Number(item.durationMinutes || 10) : undefined,
            }))
        : [];
      return { summary: String(parsed.summary || raw), recommendations };
    } catch {
      return { summary: raw, recommendations: [] };
    }
  }

  private getProvider(provider: string, model: string): AiProvider {
    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY || '';
      return new GeminiProvider(apiKey, model);
    }
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
