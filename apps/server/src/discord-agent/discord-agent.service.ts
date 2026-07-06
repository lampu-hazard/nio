import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordAgentContextService } from './discord-agent-context.service';
import { DiscordAgentToolExecutorService } from './discord-agent-tool-executor.service';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { AgentActionRendererService } from './agent-action-renderer.service';
import { GeminiProvider } from './providers/gemini.provider';
import { AiProvider } from './interfaces/ai-provider.interface';
import { AGENT_TOOLS } from './discord-agent-tools';

const DEFAULT_SYSTEM_PROMPT = `Anda adalah AI Moderator Copilot untuk Discord server bernama nio.
Tugas Anda adalah membantu moderator manusia mengelola server dengan mengecek histori pesan, riwayat warning, dan konfigurasi server.

Gunakan tool-tool yang tersedia untuk mengumpulkan fakta sebelum menyimpulkan jawaban.
Jika perlu mengusulkan moderasi (warn/timeout) atau perubahan setting, panggil tool penulisan yang sesuai. Tool penulisan tersebut akan menghasilkan proposal yang membutuhkan persetujuan moderator.
Jawab secara ringkas dan bersahabat dalam bahasa Indonesia.`;

@Injectable()
export class DiscordAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextService: DiscordAgentContextService,
    private readonly executor: DiscordAgentToolExecutorService,
    private readonly proposals: AgentActionProposalService,
    private readonly renderer: AgentActionRendererService,
  ) {}

  async handleMention(
    guildId: string,
    channelId: string,
    authorId: string,
    rawContent: string,
  ): Promise<any> {
    const settings = await this.prisma.discordAgentSettings.findUnique({ where: { guildId } });
    const isGlobalEnabled = process.env.DISCORD_AGENT_ENABLED === 'true';
    const isEnabled = settings?.enabled ?? isGlobalEnabled;
    if (!isEnabled) return null;

    const allowedUsers = settings?.allowedUserIds?.length
      ? settings.allowedUserIds
      : (process.env.DISCORD_AGENT_ALLOWED_USER_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
    if (!allowedUsers.includes(authorId)) return null;
    if (settings?.allowedChannelIds?.length && !settings.allowedChannelIds.includes(channelId)) return null;

    const botId = process.env.DISCORD_CLIENT_ID;
    let prompt = rawContent;
    if (botId) {
      prompt = prompt.replace(new RegExp(`<@!?${botId}>`, 'g'), '');
    }
    prompt = prompt.trim();

    const providerName = settings?.provider || process.env.DISCORD_AGENT_PROVIDER || 'gemini';
    const modelName = settings?.model || process.env.DISCORD_AGENT_MODEL || 'gemini-2.5-flash';
    const systemPrompt = settings?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const provider = this.getProvider(providerName, modelName);

    const history: any[] = [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ];
    let iterations = 0;
    let finalContent = '';
    let proposalId: string | null = null;

    while (iterations < 5) {
      iterations++;
      try {
        const response = await provider.generate(systemPrompt, '', history, AGENT_TOOLS);
        const candidate = response.candidates?.[0];
        const content = candidate?.content;
        const part = content?.parts?.[0];

        if (part?.functionCall) {
          const call = part.functionCall;
          history.push({
            role: 'model',
            parts: [{ functionCall: call }],
          });

          let result: any;
          try {
            result = await this.executor.execute(call.name, call.args, {
              guildId,
              channelId,
              requestedById: authorId,
            });

            if (result && result.proposalCreated) {
              proposalId = result.proposalId;
            }
          } catch (execErr: any) {
            result = { error: execErr.message || String(execErr) };
          }

          history.push({
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: call.name,
                  response: { result },
                },
              },
            ],
          });
        } else if (part?.text) {
          finalContent = part.text;
          break;
        } else {
          break;
        }
      } catch (err: any) {
        console.error('AI Loop Error:', err);
        finalContent = '⚠️ Maaf, terjadi kesalahan saat memproses permintaan AI.';
        break;
      }
    }

    if (!finalContent) {
      finalContent = '⚠️ Maaf, tidak ada respon dari model AI.';
    }

    let embeds: any[] | undefined = undefined;
    let components: any[] | undefined = undefined;

    if (proposalId) {
      const proposal = await this.prisma.agentActionProposal.findUnique({ where: { id: proposalId } });
      if (proposal) {
        const rendered = this.renderer.renderProposalMessage(proposal);
        embeds = rendered.embeds;
        components = rendered.components;
      }
    }

    await this.prisma.agentInteractionLog.create({
      data: {
        guildId,
        channelId,
        userId: authorId,
        prompt,
        response: finalContent,
        status: finalContent.startsWith('⚠️') ? 'FAILED' : 'SUCCESS',
      },
    }).catch(() => null);

    return {
      content: finalContent,
      ...(embeds ? { embeds } : {}),
      ...(components ? { components } : {}),
    };
  }

  private getProvider(provider: string, model: string): AiProvider {
    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY || '';
      return new GeminiProvider(apiKey, model);
    }
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
