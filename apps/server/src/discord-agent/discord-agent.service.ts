import { Injectable, Optional, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordAgentContextService } from './discord-agent-context.service';
import { DiscordAgentToolExecutorService } from './discord-agent-tool-executor.service';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { AgentActionRendererService } from './agent-action-renderer.service';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';
import {
  AiGenerateResult,
  AiMessage,
  AiProvider,
  AiTextPart,
  AiToolCallPart,
  AiToolDefinition,
  AiToolResultPart,
} from './interfaces/ai-provider.interface';
import { AGENT_TOOLS } from './discord-agent-tools';
import { PluginToolRegistryService } from '../plugins/plugin-tool-registry.service';
import { ConversationMemoryService, ConversationTurn } from './conversation-memory.service';
import { McpToolService } from './mcp-tool.service';
import { AgentRunService } from './agent-run.service';
import { AiAgentSettingsService } from './ai-agent-settings.service';
import { randomUUID } from 'node:crypto';
import { AgentAccessService } from './agent-access.service';
import { BudgetedChatService, BoundedAiProvider } from './quota/budgeted-chat.service';
import { AgentQuotaError } from './quota/agent-quota.types';
import { AgentProfile, AgentRequestScope, parseAgentProfile } from './agent-profile.types';
import { buildAgentSystemPrompt } from './agent-system-prompt';
import { AgentToolEntry, AgentToolPolicyService } from './agent-tool-policy.service';

// ponytail: no wall-clock limit (Hermes-style); the turn cap and repeated-call guard are what stop runaway loops.
const MAX_AGENT_TURNS = 200;
const MAX_TOOL_CALLS_PER_TURN = 8;
const MAX_TOTAL_TOOL_CALLS = 400;
const MAX_PROVIDER_RETRIES = 5;
const MAX_RESULT_BYTES = 32_000;
const MAX_DISCORD_RESPONSE_LENGTH = 2000;
const MAX_PROPOSALS = 5;

function cleanModelText(rawText: string) {
  return (rawText || '').replace(/<(?:thought|think)>[\s\S]*?(?:<\/(?:thought|think)>|$)/gi, '').trim();
}

export function sanitizeSensitiveInfo(text: string): string {
  if (!text) return text;
  let sanitized = text;

  // Discord Bot Tokens: e.g. MTM0... or similar 59+ char pattern
  sanitized = sanitized.replace(/[A-Za-z0-9_-]{24,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,38}/g, '[REDACTED_DISCORD_TOKEN]');
  // Discord MFA Tokens: e.g. mfa.VK... (84 chars)
  sanitized = sanitized.replace(/mfa\.[A-Za-z0-9_-]{84}/g, '[REDACTED_MFA_TOKEN]');
  // OpenAI / generic sk- API keys
  sanitized = sanitized.replace(/sk-[A-Za-z0-9_-]{20,}/g, '[REDACTED_API_KEY]');
  // Gemini API keys: AIzaSy... (typically 39 chars total: 6 + 33 chars)
  sanitized = sanitized.replace(/AIzaSy[A-Za-z0-9_-]{30,40}/g, '[REDACTED_GEMINI_KEY]');
  // GitHub Personal Access Tokens: ghp_...
  sanitized = sanitized.replace(/ghp_[A-Za-z0-9]{30,45}/g, '[REDACTED_GITHUB_KEY]');
  // Database connection URIs (postgres/postgresql/redis/mongodb/mysql) with credentials
  sanitized = sanitized.replace(/(postgres|postgresql|redis|mongodb|mysql):\/\/([^:]+):([^@]+)@/gi, '$1://$2:***@');
  // Explicit credential key-value patterns: token: "...", password: "...", etc.
  sanitized = sanitized.replace(/(token|password|secret|api[_-]?key|bearer)\s*[:=]\s*['"]?[A-Za-z0-9_\-\.]{10,}['"]?/gi, '$1: [REDACTED]');

  // Scrub known sensitive environment variable values if present in process.env
  const envKeysToScrub = [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_SECRET',
    'GEMINI_API_KEY',
    'OPENAI_API_KEY',
    'DATABASE_URL',
    'REDIS_URL',
    'SESSION_SECRET',
    'JWT_SECRET',
    'GROQ_API_KEY',
    'OPENROUTER_API_KEY',
    'BRAVE_SEARCH_API_KEY',
    'TAVILY_API_KEY',
  ];
  for (const envKey of envKeysToScrub) {
    const val = process.env[envKey]?.trim();
    if (val && val.length >= 6) {
      sanitized = sanitized.split(val).join('[REDACTED]');
    }
  }

  return sanitized;
}

export function neutralizeMentions(text: string): string {
  if (!text) return text;
  return text.replace(/@(everyone|here)/gi, (_, mention) => `@${String.fromCharCode(8203)}${mention}`);
}

export function formatAgentResponse(finalText: string): string {
  const cleanFinal = sanitizeSensitiveInfo(neutralizeMentions(cleanModelText(finalText))).trim();
  if (cleanFinal.length > MAX_DISCORD_RESPONSE_LENGTH) {
    return `${cleanFinal.slice(0, MAX_DISCORD_RESPONSE_LENGTH - 3)}...`;
  }
  return cleanFinal;
}

export function compactHistoryMessages(messages: AiMessage[]): AiMessage[] {
  if (messages.length <= 4) return messages;

  return messages.map((msg, index) => {
    if (index >= messages.length - 2 || msg.role !== 'user' || !msg.parts) {
      return msg;
    }

    const compactedParts = msg.parts.map((part) => {
      if (part.type === 'tool_result' && part.result?.ok && part.result.value) {
        const serialized = JSON.stringify(part.result.value);
        if (serialized.length > 2000) {
          const val = part.result.value as any;
          const preview = Array.isArray(val)
            ? `Array(${val.length} item) - contoh awal: ${JSON.stringify(val.slice(0, 2))}`
            : typeof val === 'object' && val !== null
            ? `Object keys: [${Object.keys(val).join(', ')}]`
            : serialized.slice(0, 300);

          return {
            ...part,
            result: {
              ok: true,
              value: {
                _compacted: true,
                note: `Hasil tool ${part.name} dari turn sebelumnya diringkas untuk efisiensi context window.`,
                preview,
              },
            },
          };
        }
      }
      return part;
    });

    return { ...msg, parts: compactedParts };
  });
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

export type AgentProgressCallback = (status: string) => Promise<void> | void;

export type AgentReply = {
  profile: AgentProfile;
  content: string;
  embeds?: any[];
  components?: any[];
  files?: Array<{ attachment: Buffer; name: string }>;
  conversationTurns?: ConversationTurn[];
};

@Injectable()
export class DiscordAgentService {
  private readonly logger = new Logger(DiscordAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contextService: DiscordAgentContextService,
    private readonly executor: DiscordAgentToolExecutorService,
    private readonly proposals: AgentActionProposalService,
    private readonly renderer: AgentActionRendererService,
    private readonly memory: ConversationMemoryService,
    private readonly pluginTools: PluginToolRegistryService,
    @Optional() private readonly mcpTools?: McpToolService,
    @Optional() private readonly runs?: AgentRunService,
    @Optional() private readonly aiSettings?: AiAgentSettingsService,
    @Optional() private readonly access?: AgentAccessService,
    @Optional() private readonly budgetedChat?: BudgetedChatService,
    @Optional() private readonly toolPolicy?: AgentToolPolicyService,
  ) {}

  async getAccessDecision(
    guildId: string,
    channelId: string,
    authorId: string,
    profile: AgentProfile = 'ADMIN',
  ) {
    const resolvedProfile = parseAgentProfile(profile);
    const scope: AgentRequestScope = {
      guildId,
      profile: resolvedProfile,
      channelId,
      userId: authorId,
    };
    if (this.access) {
      const decision = await this.access.resolve(scope, 'CHAT');
      return decision.allowed
        ? ({ allowed: true, reason: 'allowed', settings: decision.settings } as const)
        : ({ allowed: false, reason: decision.code.toLowerCase().replace(/_/g, '-'), settings: null } as const);
    }
    const settings = await this.prisma.discordAgentSettings.findUnique({
      where: { guildId_profile: { guildId, profile: resolvedProfile } },
    });
    if (settings?.accessMode === 'ROLE_QUOTAS') return { allowed: false, reason: 'membership-unavailable', settings } as const;
    const isEnabled = settings?.enabled ?? process.env.DISCORD_AGENT_ENABLED === 'true';
    if (!isEnabled) return { allowed: false, reason: 'disabled', settings } as const;

    const allowedUsers = settings
      ? settings.allowedUserIds || []
      : (process.env.DISCORD_AGENT_ALLOWED_USER_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
    if (!allowedUsers.includes('*') && !allowedUsers.includes(authorId)) return { allowed: false, reason: 'user-not-allowed', settings } as const;
    if (settings?.excludedChannelIds?.includes('*') || settings?.excludedChannelIds?.includes(channelId)) {
      return { allowed: false, reason: 'channel-excluded', settings } as const;
    }
    return { allowed: true, reason: 'allowed', settings } as const;
  }

  async canHandle(
    guildId: string,
    channelId: string,
    authorId: string,
    profile: AgentProfile = 'ADMIN',
  ) {
    const { allowed, settings } = await this.getAccessDecision(guildId, channelId, authorId, profile);
    return { allowed, settings };
  }

  async handleMention(
    guildId: string,
    channelId: string,
    authorId: string,
    rawContent: string,
    referencedBotMessageId?: string,
    replyContext?: ReferencedMessageContext,
    onProgress?: AgentProgressCallback,
    profile: AgentProfile = 'ADMIN',
  ): Promise<any> {
    const resolvedProfile = parseAgentProfile(profile);
    const scope: AgentRequestScope = {
      guildId,
      profile: resolvedProfile,
      channelId,
      userId: authorId,
    };
    const { allowed, settings } = await this.canHandle(guildId, channelId, authorId, resolvedProfile);
    if (!allowed) return null;

    const botId = process.env.DISCORD_CLIENT_ID;
    let prompt = rawContent;
    if (botId) {
      prompt = prompt.replace(new RegExp(`<@!?${botId}>`, 'g'), '');
    }
    prompt = prompt.trim();

    if (!prompt && !replyContext) {
      return {
        profile: resolvedProfile,
        content: '⚠️ Sebutkan pertanyaan atau instruksi setelah mention saya.',
      };
    }

    const providerName = settings?.provider || process.env.DISCORD_AGENT_PROVIDER || 'gemini';
    const modelName = settings?.model || process.env.DISCORD_AGENT_MODEL || 'gemini-2.5-flash';
    const effectiveSystemPrompt = buildAgentSystemPrompt(resolvedProfile, settings?.systemPrompt, authorId);

    if (settings?.accessMode === 'ROLE_QUOTAS' && !this.budgetedChat) {
      return {
        profile: resolvedProfile,
        content: '⚠️ Pencatatan kuota AI tidak tersedia. Coba lagi nanti.',
      };
    }
    const run = await this.runs?.start(scope, settings?.messageRetentionDays ?? 30);
    let chatRun: Awaited<ReturnType<BudgetedChatService['beginRun']>> | undefined;
    try {
      chatRun = await this.budgetedChat?.beginRun({
        ...scope,
        requestId: randomUUID(),
        runId: run?.id,
        provider: (current) => this.getProvider(
          current?.provider || process.env.DISCORD_AGENT_PROVIDER || 'gemini',
          current?.model || process.env.DISCORD_AGENT_MODEL || 'gemini-2.5-flash',
          this.aiSettings?.decryptApiKey(current?.encryptedApiKey), current?.baseUrl,
        ),
      });
    } catch (err) {
      const explained = this.explainChatError(err);
      if (run && this.runs) await this.runs.finish(run.id, 'FAILED', explained.code).catch(() => undefined);
      return {
        profile: resolvedProfile,
        content: explained.message,
      };
    }
    try {
      // Only legacy callers without the metering dependency use the compatibility adapter.
      const provider = chatRun ? undefined : this.getProvider(providerName, modelName,
        this.aiSettings?.decryptApiKey(settings?.encryptedApiKey), settings?.baseUrl);
      const generate = (request: Parameters<AiProvider['generate']>[0]) => chatRun
        ? chatRun.generate(request)
        : this.generateWithRetry(providerName, () => provider!.generate({ ...request, maxOutputTokens: settings?.maxOutputTokens ?? 2048 }));
      const reportStage = async (stage: 'PLANNING' | 'INVESTIGATING' | 'SYNTHESIZING' | 'AWAITING_APPROVAL', message: string) => {
        if (run && this.runs) await this.runs.stage(run.id, stage, message).catch(() => undefined);
        await onProgress?.(message);
      };

      const toolMap = new Map<string, AiToolDefinition>();
      let availableTools: AiToolDefinition[];
      if (this.toolPolicy) {
        availableTools = await this.toolPolicy.definitions({
          ...scope,
          requestedById: authorId,
        });
        for (const tool of availableTools) {
          toolMap.set(tool.name, tool);
        }
      } else {
        const builtInTools = resolvedProfile === 'PUBLIC'
          ? AGENT_TOOLS.filter((t) => t.name === 'web_search' || t.name === 'web_fetch')
          : AGENT_TOOLS;
        const pluginToolList = resolvedProfile === 'PUBLIC'
          ? []
          : await this.pluginTools.definitionsForGuild(guildId);
        const mcpToolList = resolvedProfile === 'PUBLIC' || !this.mcpTools
          ? []
          : await this.mcpTools.definitions().catch(() => []);

        for (const tool of [...builtInTools, ...pluginToolList, ...mcpToolList]) {
          if (!toolMap.has(tool.name)) {
            toolMap.set(tool.name, tool);
          }
        }
        availableTools = Array.from(toolMap.values());
      }

      let previousTurns: ConversationTurn[] = [];
      if (referencedBotMessageId) {
        previousTurns = await this.memory.loadHistory(scope, referencedBotMessageId);
      }

      let userPrompt = prompt;
      if (replyContext) {
        const attachmentLines = replyContext.attachments.length
          ? replyContext.attachments.map((a) => `- ${a.name}: ${a.url}`).join('\n')
          : 'none';
        const requestHeader = resolvedProfile === 'PUBLIC' ? 'Pesan pengguna:' : 'Permintaan moderator:';
        const defaultPromptFallback = resolvedProfile === 'PUBLIC' ? '(lihat pesan di atas)' : '(analisis pesan di atas)';
        userPrompt = `Konteks pesan yang di-reply:
Author: ${replyContext.authorTag} (${replyContext.authorId})
Channel: <#${replyContext.channelId}>
Waktu: ${replyContext.createdAt.toISOString()}
Isi:
${replyContext.content || '(no text content)'}
Attachments: ${attachmentLines}

${requestHeader}
${prompt || defaultPromptFallback}`;
      }

      const messages: AiMessage[] = previousTurns.flatMap((turn) => [
        { role: 'user', parts: [{ type: 'text', text: turn.userPrompt }] },
        { role: 'assistant', parts: [{ type: 'text', text: turn.aiResponse }] },
      ]);

      messages.push({
        role: 'user',
        parts: [{ type: 'text', text: userPrompt }],
      });

      this.logger.log(`🚀 [Agent:${resolvedProfile}] Request from user ${authorId} in guild ${guildId}: "${prompt.slice(0, 100)}"`);

      let turns = 0;
      let totalToolCalls = 0;
      let finalContent = '';
      let lastEmittedText = '';
      let hasPartialResults = false;
      const proposalIds: string[] = [];
      const callCounts = new Map<string, number>();
      const startTime = Date.now();

      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;

      while (turns < MAX_AGENT_TURNS) {
        turns++;
        this.logger.log(`💭 [Turn ${turns}/${MAX_AGENT_TURNS}] Thinking...`);

        await reportStage(turns === 1 ? 'PLANNING' : 'SYNTHESIZING', turns === 1 ? '🧭 *Menyiapkan pemeriksaan...*' : '🧩 *Menyatukan temuan...*');

        let response: AiGenerateResult;
        let streamedText = '';
        try {
          response = await generate({
            systemPrompt: effectiveSystemPrompt,
            messages: compactHistoryMessages([...messages]),
            tools: availableTools,
            onTextDelta: async (delta) => {
              streamedText += delta;
              if (!onProgress) return;
              const safeText = sanitizeSensitiveInfo(neutralizeMentions(cleanModelText(streamedText)));
              if (safeText) await onProgress(`[draft] ${safeText.slice(-1000)}`);
            },
          });
        } catch (err: any) {
          const explained = this.explainChatError(err);
          this.logger.warn(`AI provider request failed provider=${providerName} code=${explained.code}`);
          finalContent = explained.message;
          break;
        }

        if (response?.usage) {
          promptTokens += response.usage.promptTokens || 0;
          completionTokens += response.usage.completionTokens || 0;
          totalTokens += response.usage.totalTokens || 0;
        }

        const assistantMessage = response?.message;
        if (!assistantMessage || !assistantMessage.parts?.length) {
          break;
        }

        messages.push(assistantMessage);

        const textParts = assistantMessage.parts.filter((p): p is AiTextPart => p.type === 'text');
        if (textParts.length > 0) {
          const fullTurnText = textParts.map((p) => p.text).join('\n');
          const cleanText = cleanModelText(fullTurnText);
          if (cleanText) lastEmittedText = cleanText;
        }

        const toolCalls = assistantMessage.parts.filter((p): p is AiToolCallPart => p.type === 'tool_call');
        if (toolCalls.length === 0) {
          if (lastEmittedText) finalContent = lastEmittedText;
          break;
        }

        const callsToProcess = toolCalls.slice(0, MAX_TOOL_CALLS_PER_TURN);
        const toolNames = callsToProcess.map((c) => `\`${c.name}\``).join(', ');
        this.logger.log(`🔧 [Tool Call${callsToProcess.length > 1 ? 's' : ''}] ${callsToProcess.map((c) => c.name).join(', ')}`);
        await reportStage('INVESTIGATING', `🔎 *Memeriksa sumber: ${toolNames}...*`);

        let shouldTerminateForRepetition = false;

        interface CallPlan {
          call: AiToolCallPart;
          preError?: { code: string; message: string };
        }

        const plannedCalls: CallPlan[] = [];

        for (const call of callsToProcess) {
          totalToolCalls++;
          if (totalToolCalls > MAX_TOTAL_TOOL_CALLS) {
            hasPartialResults = true;
            plannedCalls.push({
              call,
              preError: { code: 'CALL_LIMIT_EXCEEDED', message: `Total tool call limit reached (max ${MAX_TOTAL_TOOL_CALLS}).` },
            });
            continue;
          }

          const signature = `${call.name}:${JSON.stringify(call.arguments || {})}`;
          const count = (callCounts.get(signature) || 0) + 1;
          callCounts.set(signature, count);
          if (count >= 3) {
            shouldTerminateForRepetition = true;
            plannedCalls.push({
              call,
              preError: { code: 'REPEATED_CALL_TERMINATED', message: 'Repeated identical tool call detected 3 times. Terminating.' },
            });
            break;
          }

          plannedCalls.push({ call });
        }

        const toolResultParts: AiToolResultPart[] = await Promise.all(
          plannedCalls.map(async ({ call, preError }): Promise<AiToolResultPart> => {
            if (preError) {
              return {
                type: 'tool_result',
                toolCallId: call.id,
                name: call.name,
                result: { ok: false, error: preError },
              };
            }

            let resolvedEntry: AgentToolEntry | undefined;
            if (this.toolPolicy) {
              try {
                resolvedEntry = await this.toolPolicy.resolveCall(
                  { ...scope, requestedById: authorId },
                  call.name,
                  call.arguments,
                );
              } catch (policyErr: any) {
                return {
                  type: 'tool_result',
                  toolCallId: call.id,
                  name: call.name,
                  result: {
                    ok: false,
                    error: {
                      code: 'UNKNOWN_TOOL',
                      message: policyErr?.message || `Unknown or disallowed tool: ${call.name}`,
                    },
                  },
                };
              }
            }

            const mcpResolved = resolvedProfile === 'ADMIN' ? this.mcpTools?.resolve(call.name) : undefined;
            const toolDef = resolvedEntry?.definition || toolMap.get(call.name);
            const safety = mcpResolved?.safety || toolDef?.safety;

            if (!safety) {
              return {
                type: 'tool_result',
                toolCallId: call.id,
                name: call.name,
                result: {
                  ok: false,
                  error: { code: 'UNKNOWN_TOOL', message: `Unknown or disallowed tool: ${call.name}` },
                },
              };
            }

            if (safety.mode === 'write' || safety.proposalRequired) {
              if (resolvedProfile !== 'ADMIN') {
                return {
                  type: 'tool_result',
                  toolCallId: call.id,
                  name: call.name,
                  result: {
                    ok: false,
                    error: { code: 'TOOL_FORBIDDEN', message: 'Write and proposal tools are not allowed in PUBLIC profile.' },
                  },
                };
              }
              try {
                let proposalResult: any;
                if (mcpResolved) {
                  const originToolId = resolvedEntry?.id || `mcp:${mcpResolved.config.name}:${mcpResolved.remoteName}`;
                  const proposal = await this.proposals.createProposal({
                    guildId,
                    profile: 'ADMIN',
                    originToolId,
                    channelId,
                    requestedById: authorId,
                    targetUserId: null,
                    recommendation: {
                      type: 'MCP_TOOL_CALL',
                      reason: String((call.arguments as any)?.reason || `MCP tool call: ${call.name}`),
                      mcpServer: mcpResolved.config.name,
                      mcpTool: mcpResolved.remoteName,
                      mcpArguments: call.arguments,
                    },
                  });
                  proposalResult = {
                    proposalCreated: true,
                    proposalId: proposal.id,
                    actionType: 'MCP_TOOL_CALL',
                  };
                } else {
                  proposalResult = await this.executor.execute(call.name, call.arguments, {
                    guildId,
                    profile: resolvedProfile,
                    channelId,
                    userId: authorId,
                    requestedById: authorId,
                  });
                }

                return {
                  type: 'tool_result',
                  toolCallId: call.id,
                  name: call.name,
                  result: {
                    ok: true,
                    value: {
                      ...proposalResult,
                      status: 'PROPOSAL_PENDING_CONFIRMATION',
                      message: 'Action proposal created. Awaiting human moderator approval.',
                    },
                  },
                };
              } catch (propErr: any) {
                this.logger.warn(`📝 [Proposal Failed: ${call.name}] error=${sanitizeSensitiveInfo(propErr.message || String(propErr)).slice(0, 160)}`);
                return {
                  type: 'tool_result',
                  toolCallId: call.id,
                  name: call.name,
                  result: {
                    ok: false,
                    error: { code: 'PROPOSAL_CREATION_FAILED', message: propErr.message || String(propErr) },
                  },
                };
              }
            }

            try {
              let res: any;
              if (mcpResolved && !this.toolPolicy) {
                res = await this.mcpTools!.execute(call.name, call.arguments);
              } else {
                res = await this.executor.execute(call.name, call.arguments, {
                  guildId,
                  profile: resolvedProfile,
                  channelId,
                  userId: authorId,
                  requestedById: authorId,
                });
              }

              const serialized = JSON.stringify(res ?? null);
              let cappedVal = res;
              if (serialized.length > MAX_RESULT_BYTES) {
                cappedVal = {
                  truncated: true,
                  content: serialized.slice(0, MAX_RESULT_BYTES),
                };
              }

              if (run && this.runs) {
                const outcome = cappedVal?.truncated ? 'PARTIAL' : res == null || (Array.isArray(res) && res.length === 0) ? 'EMPTY' : 'SUCCESS';
                const summary = outcome === 'EMPTY' ? `${call.name} selesai tanpa hasil.` : `${call.name} selesai; hasil tersedia${outcome === 'PARTIAL' ? ' dan dipotong sesuai batas ukuran' : ''}.`;
                await this.runs.evidence(run.id, call.name, outcome, summary).catch(() => undefined);
              }

              this.logger.log(`📥 [Tool Result: ${call.name}] ok=true`);
              return {
                type: 'tool_result',
                toolCallId: call.id,
                name: call.name,
                result: {
                  ok: true,
                  value: cappedVal,
                },
              };
            } catch (execErr: any) {
              hasPartialResults = true;
              if (run && this.runs) await this.runs.evidence(run.id, call.name, 'FAILED', `${call.name} gagal dijalankan.`).catch(() => undefined);
              this.logger.warn(`📥 [Tool Result: ${call.name}] ok=false error=${execErr.message || String(execErr)}`);
              return {
                type: 'tool_result',
                toolCallId: call.id,
                name: call.name,
                result: {
                  ok: false,
                  error: { code: 'EXECUTION_ERROR', message: execErr.message || String(execErr) },
                },
              };
            }
          }),
        );

        for (const resPart of toolResultParts) {
          const val = resPart.result?.ok ? (resPart.result.value as any) : null;
          if (val?.proposalCreated && val?.proposalId && resolvedProfile === 'ADMIN') {
            const propId = String(val.proposalId);
            if (proposalIds.length < MAX_PROPOSALS) {
              proposalIds.push(propId);
            }
            this.logger.log(`📝 [Proposal Created] id=${propId} action=${resPart.name}`);
            if (run && this.runs) await this.runs.proposal(run.id, propId, resPart.name).catch(() => undefined);
          }
        }

        messages.push({
          role: 'user',
          parts: toolResultParts,
        });

        if (toolResultParts.length > 0) {
          await reportStage('SYNTHESIZING', '🧩 *Menyatukan temuan...*');
        }

        if (shouldTerminateForRepetition) {
          break;
        }
      }

      this.logger.log(`✅ [Agent:${resolvedProfile}] Completed in ${Date.now() - startTime}ms (${turns} turns, ${totalTokens} tokens)`);

      if (!finalContent && messages.some((m) => m.role === 'user' && m.parts?.some((p) => p.type === 'tool_result'))) {
        try {
          await reportStage('SYNTHESIZING', '🧾 *Menyusun laporan akhir...*');
          const synthesisRes = await generate({
            systemPrompt: effectiveSystemPrompt,
            messages: [
              ...compactHistoryMessages(messages),
              {
                role: 'user',
                parts: [{ type: 'text', text: 'Semua pemanggilan tool telah selesai. Sekarang, berikan jawaban akhir yang jelas, lengkap, dan informatif kepada pengguna berdasarkan data dan temuan tool di atas.' }],
              },
            ],
            tools: [],
          });
          promptTokens += synthesisRes.usage?.promptTokens || 0;
          completionTokens += synthesisRes.usage?.completionTokens || 0;
          totalTokens += synthesisRes.usage?.totalTokens || 0;
          const synthText = synthesisRes?.message?.parts
            ?.filter((p): p is AiTextPart => p.type === 'text')
            ?.map((p) => p.text)
            ?.join('\n');
          if (synthText) {
            finalContent = cleanModelText(synthText);
          }
        } catch (synthErr) {
          this.logger.warn(`Failed to synthesize final response after turn exhaustion: ${synthErr}`);
          if (!lastEmittedText && synthErr instanceof AgentQuotaError) {
            finalContent = this.explainChatError(synthErr).message;
          }
        }
      }

      if (!finalContent && lastEmittedText) {
        finalContent = lastEmittedText;
      }

      if (!finalContent) {
        finalContent = '⚠️ Maaf, tidak ada respon dari model AI.';
      }

      const fullResponse = formatAgentResponse(finalContent);
      const runStatus: 'AWAITING_APPROVAL' | 'FAILED' | 'PARTIAL' | 'COMPLETED' = fullResponse.startsWith('⚠️') ? 'FAILED' : proposalIds.length ? 'AWAITING_APPROVAL' : hasPartialResults ? 'PARTIAL' : 'COMPLETED';
      if (run && this.runs) {
        if (runStatus === 'AWAITING_APPROVAL') await reportStage('AWAITING_APPROVAL', '⏳ *Menunggu persetujuan moderator...*');
        else if (runStatus !== 'FAILED') await reportStage('SYNTHESIZING', '🧾 *Menyusun laporan akhir...*');
        await this.runs.finish(run.id, runStatus, runStatus === 'AWAITING_APPROVAL' ? 'Pemeriksaan selesai; tindakan terkait masih menunggu persetujuan.' : runStatus === 'FAILED' ? 'Run berakhir dengan kegagalan.' : runStatus === 'PARTIAL' ? 'Run selesai dengan hasil parsial.' : 'Run selesai.').catch(() => undefined);
      }
      const sanitizedCleanFinal = sanitizeSensitiveInfo(neutralizeMentions(finalContent));

      let embeds: any = undefined;
      let components: any = undefined;

      if (proposalIds.length > 0 && resolvedProfile === 'ADMIN') {
        if (proposalIds.length === 1) {
          const proposal = await this.prisma.agentActionProposal.findUnique({ where: { id: proposalIds[0] } });
          if (proposal) {
            const rendered = await this.renderer.renderProposalMessage(proposal);
            embeds = rendered.embeds;
            components = rendered.components;
          }
        } else {
          const subProposals: any[] = [];
          for (const id of proposalIds) {
            const p = await this.prisma.agentActionProposal.findUnique({ where: { id } });
            if (p) subProposals.push(p);
          }
          if (subProposals.length > 0) {
            const batchProposal = await this.proposals.createBatchProposal({
              guildId,
              profile: 'ADMIN',
              originToolId: 'batch',
              channelId,
              requestedById: authorId,
              proposalIds: subProposals.map((p) => p.id),
            });
            const rendered = await this.renderer.renderBatchProposalMessage(batchProposal, subProposals);
            embeds = rendered.embeds;
            components = rendered.components;
          }
        }
      }

      if (chatRun) totalTokens = chatRun.spentTokens;
      await this.prisma.agentInteractionLog.create({
        data: {
          guildId,
          profile: resolvedProfile,
          channelId,
          userId: authorId,
          prompt,
          response: fullResponse,
          status: runStatus === 'FAILED' ? 'FAILED' : runStatus === 'PARTIAL' || runStatus === 'AWAITING_APPROVAL' ? 'PARTIAL' : 'SUCCESS',
          promptTokens,
          completionTokens,
          totalTokens,
        },
      }).catch(() => null);

      let conversationTurns: any = undefined;
      if (!fullResponse.startsWith('⚠️')) {
        conversationTurns = [
          ...previousTurns,
          { userPrompt: prompt, aiResponse: sanitizedCleanFinal, timestamp: Date.now() },
        ];
      }

      return {
        profile: resolvedProfile,
        content: fullResponse,
        ...(embeds ? { embeds } : {}),
        ...(components ? { components } : {}),
        ...(conversationTurns ? { conversationTurns } : {}),
      };
    } finally {
      await chatRun?.close();
    }
  }

  private explainChatError(err: unknown): { code: string; message: string } {
    if (err instanceof AgentQuotaError) {
      if (err.code === 'QUOTA_EXHAUSTED') return { code: err.code, message: '⚠️ Kuota token AI harian member atau server habis. Kuota direset pukul 00:00 UTC.' };
      if (err.code === 'RUN_BUDGET_EXHAUSTED') return { code: err.code, message: '⚠️ Permintaan melewati batas token per-run atau sisa kuota harian yang tersedia.' };
      if (err.code === 'BUSY') return { code: err.code, message: '⚠️ Permintaan AI kamu sebelumnya masih berjalan. Tunggu sampai selesai.' };
      if (err.code === 'ROLE_DENIED' || err.code === 'USER_DENIED') return { code: err.code, message: '⚠️ Role kamu tidak memiliki izin menggunakan chat AI.' };
      if (err.code === 'LEASE_LOST' || err.code === 'POLICY_CHANGED') return { code: err.code, message: '⚠️ Sesi kuota atau kebijakan akses berubah saat permintaan berjalan. Silakan coba lagi.' };
      if (err.code === 'GEMINI_BUDGET_UNSUPPORTED' || err.code === 'OPENAI_BUDGET_UNSUPPORTED') return { code: err.code, message: '⚠️ Provider AI yang dipilih belum mendukung pembatasan kuota token per panggilan.' };
      return { code: err.code, message: `⚠️ Maaf, terjadi kesalahan saat memproses permintaan AI. Kode: ${err.code}.` };
    }
    const rawMessage = String((err as any)?.message || err || 'Unknown provider error');
    const safeCode = rawMessage.match(/\b(?:OPENAI|GEMINI)_[A-Z0-9_]+\b/)?.[0] || 'AI_PROVIDER_ERROR';
    if (/HTTP_429\b/.test(rawMessage)) {
      return { code: safeCode, message: '⚠️ Batas kuota AI terlampaui (Rate Limit / Quota Exceeded). Mohon tunggu beberapa saat sebelum mencoba kembali.' };
    }
    return { code: safeCode, message: `⚠️ Maaf, terjadi kesalahan saat memproses permintaan AI. Kode: ${safeCode}.` };
  }

  // Transient provider errors (5xx, 429, network, truncated stream) are retried with backoff; 4xx config errors fail fast.
  private async generateWithRetry(providerName: string, call: () => Promise<AiGenerateResult>): Promise<AiGenerateResult> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await call();
      } catch (err: any) {
        const msg = String(err?.message || err);
        const transient = !/_HTTP_4(?!29)\d\d\b|not configured|Unsupported AI provider|requires at least one message/.test(msg);
        if (!transient || attempt > MAX_PROVIDER_RETRIES) throw err;
        const delay = Math.min(30_000, 1000 * 2 ** (attempt - 1));
        this.logger.warn(`AI provider retry ${attempt}/${MAX_PROVIDER_RETRIES} provider=${providerName} in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  private getProvider(provider: string, model: string, configuredApiKey?: string, configuredBaseUrl?: string | null): BoundedAiProvider {
    const normalized = (provider || '').toLowerCase();
    if (normalized === 'gemini') {
      const apiKey = configuredApiKey || process.env.GEMINI_API_KEY || '';
      return new GeminiProvider(apiKey, model);
    }
    if (
      normalized === 'openai' ||
      normalized === 'openai-compatible' ||
      normalized === 'openrouter' ||
      normalized === 'groq' ||
      normalized === 'ollama'
    ) {
      const apiKey = configuredApiKey || process.env.OPENAI_API_KEY || '';
      const baseUrl =
        configuredBaseUrl ||
        process.env.OPENAI_BASE_URL ||
        process.env.OPENAI_API_BASE ||
        'https://api.openai.com/v1';
      return new OpenAiProvider(apiKey, model, baseUrl);
    }
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
