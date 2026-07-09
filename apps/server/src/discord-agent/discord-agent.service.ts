import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordAgentContextService } from './discord-agent-context.service';
import { DiscordAgentToolExecutorService } from './discord-agent-tool-executor.service';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { AgentActionRendererService } from './agent-action-renderer.service';
import { GeminiProvider } from './providers/gemini.provider';
import { AiProvider } from './interfaces/ai-provider.interface';
import { AGENT_TOOLS } from './discord-agent-tools';
import { ConversationMemoryService, ConversationTurn } from './conversation-memory.service';

const DEFAULT_SYSTEM_PROMPT = `Anda adalah AI Moderator Copilot untuk Discord server bernama nio.
Tugas Anda adalah membantu mengelola server dengan mengecek histori pesan, riwayat warning, histori channel, role, channel, dan konfigurasi server.

Gunakan tool baca yang tersedia untuk mengumpulkan fakta sebelum menyimpulkan jawaban atau mengusulkan tindakan.
Jika perlu mengusulkan moderasi (warn/timeout/kick/ban/purge), add/remove role, remove timeout, revoke warning, atau perubahan setting, panggil tool penulisan yang sesuai. Tool penulisan tersebut hanya membuat proposal dan perlu di-execute lewat kartu aksi.
Jangan pernah menyatakan tindakan destruktif sudah dilakukan sebelum kartu aksi dieksekusi. Pilih tindakan paling ringan yang efektif berdasarkan bukti.
Jawab secara ringkas dan bersahabat dalam bahasa Indonesia.`;

let cachedDefaultSystemPrompt: string | null = null;

function loadDefaultSystemPrompt() {
  if (cachedDefaultSystemPrompt) return cachedDefaultSystemPrompt;

  const candidates = [
    path.resolve(process.cwd(), 'system-prompt.md'),
    path.resolve(process.cwd(), 'apps/server/system-prompt.md'),
    path.resolve(__dirname, '../../system-prompt.md'),
    path.resolve(__dirname, '../system-prompt.md'),
  ];

  for (const candidate of candidates) {
    try {
      const prompt = fs.readFileSync(candidate, 'utf8').trim();
      if (prompt) {
        cachedDefaultSystemPrompt = prompt;
        return cachedDefaultSystemPrompt;
      }
    } catch {
      // Try the next runtime path, then fall back to the built-in prompt.
    }
  }

  cachedDefaultSystemPrompt = DEFAULT_SYSTEM_PROMPT;
  return cachedDefaultSystemPrompt;
}

export type ReferencedMessageContext = {
  id: string;
  channelId: string;
  authorId: string;
  authorTag: string;
  content: string;
  createdAt: Date;
  attachments: Array<{ name: string; url: string }>;
};

@Injectable()
export class DiscordAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextService: DiscordAgentContextService,
    private readonly executor: DiscordAgentToolExecutorService,
    private readonly proposals: AgentActionProposalService,
    private readonly renderer: AgentActionRendererService,
    private readonly memory: ConversationMemoryService,
  ) {}

  async handleMention(
    guildId: string,
    channelId: string,
    authorId: string,
    rawContent: string,
    referencedBotMessageId?: string,
    replyContext?: ReferencedMessageContext,
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
    const systemPrompt = settings?.systemPrompt || loadDefaultSystemPrompt();
    const provider = this.getProvider(providerName, modelName);

    let previousTurns: ConversationTurn[] = [];
    if (referencedBotMessageId) {
      previousTurns = await this.memory.loadHistory(guildId, referencedBotMessageId);
    }

    const history: any[] = previousTurns.flatMap((turn) => [
      { role: 'user', parts: [{ text: turn.userPrompt }] },
      { role: 'model', parts: [{ text: turn.aiResponse }] },
    ]);

    let userPrompt = prompt;
    if (replyContext) {
      const attachmentLines = replyContext.attachments.length
        ? replyContext.attachments.map((a) => `- ${a.name}: ${a.url}`).join('\n')
        : 'none';
      userPrompt = `Konteks pesan yang di-reply:
Author: ${replyContext.authorTag} (${replyContext.authorId})
Channel: <#${replyContext.channelId}>
Waktu: ${replyContext.createdAt.toISOString()}
Isi:
${replyContext.content || '(no text content)'}
Attachments: ${attachmentLines}

Permintaan moderator:
${prompt}`;
    }

    let iterations = 0;
    let finalContent = '';
    let proposalId: string | null = null;

    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    while (iterations < 5) {
      iterations++;
      try {
        const response = await provider.generate(systemPrompt, userPrompt, history, AGENT_TOOLS);

        const usage = response?.usageMetadata;
        if (usage) {
          promptTokens += usage.promptTokenCount || 0;
          completionTokens += usage.candidatesTokenCount || 0;
          totalTokens += usage.totalTokenCount || 0;
        }
        const candidate = response.candidates?.[0];
        const content = candidate?.content;
        const part = content?.parts?.[0];

        if (part?.functionCall) {
          const call = part.functionCall;

          // Jika ini adalah turn pertama setelah loaded history, simpan prompt user awal ke history agar runtut
          if (history.length === previousTurns.length * 2) {
            history.push({
              role: 'user',
              parts: [{ text: prompt }],
            });
          }

          history.push(content);

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
                  response: {
                    content: JSON.stringify(result),
                  },
                },
              },
            ],
          });
          userPrompt = ''; // Kosongkan agar turn berikutnya tidak mengirim prompt awal lagi
        } else if (part?.text) {
          finalContent = part.text;
          break;
        } else {
          break;
        }
      } catch (err: any) {
        console.error('AI Loop Error:', err);
        const rawMessage = err?.message || String(err);
        if (rawMessage.includes('429')) {
          finalContent = '⚠️ Batas kuota AI terlampaui (Rate Limit / Quota Exceeded). Mohon tunggu beberapa saat sebelum mencoba kembali.';
        } else {
          finalContent = `⚠️ Maaf, terjadi kesalahan saat memproses permintaan AI: ${rawMessage.slice(0, 100)}`;
        }
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
        promptTokens,
        completionTokens,
        totalTokens,
      },
    }).catch(() => null);

    let conversationTurns: ConversationTurn[] | undefined = undefined;
    if (!finalContent.startsWith('⚠️')) {
      conversationTurns = [
        ...previousTurns,
        { userPrompt: prompt, aiResponse: finalContent, timestamp: Date.now() },
      ];
    }

    return {
      content: finalContent,
      ...(embeds ? { embeds } : {}),
      ...(components ? { components } : {}),
      ...(conversationTurns ? { conversationTurns } : {}),
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
