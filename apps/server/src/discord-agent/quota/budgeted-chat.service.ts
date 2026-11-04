import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AgentAccessService, AdmissionDecision } from '../agent-access.service';
import { AgentQuotaService } from './agent-quota.service';
import { AgentQuotaError, Lease, TokenQuotaPolicy } from './agent-quota.types';
import { AiGenerateRequest, AiGenerateResult, AiProvider, PreparedChatCall } from '../interfaces/ai-provider.interface';
import { ProviderCallError, validateTokenUsage } from '../providers/chat-request-budget';
import { fitChatRequest, InsufficientRequestCapacityError } from '../providers/chat-context-budget';
import { AgentProfile, parseAgentProfile } from '../agent-profile.types';

type Settings = Extract<AdmissionDecision, { allowed: true }>['settings'];
export interface BoundedAiProvider extends AiProvider {
  prepare(request: AiGenerateRequest, options?: { profile?: AgentProfile; signal?: AbortSignal }): Promise<PreparedChatCall> | PreparedChatCall;
  generatePrepared(call: PreparedChatCall, signal?: AbortSignal, onTextDelta?: AiGenerateRequest['onTextDelta']): Promise<AiGenerateResult>;
}
export type ChatRunInput = {
  guildId: string;
  profile?: AgentProfile;
  channelId: string;
  userId: string;
  requestId: string;
  runId?: string;
  provider: (settings: Settings) => BoundedAiProvider;
  signal?: AbortSignal;
};
export type ChatRun = {
  readonly spentTokens: number;
  generate(request: AiGenerateRequest): Promise<AiGenerateResult>;
  close(): Promise<void>;
};

@Injectable()
export class BudgetedChatService {
  constructor(private readonly access: AgentAccessService, private readonly quota: AgentQuotaService) {}

  private async resolveAdmission(guildId: string, profile: AgentProfile, channelId: string, userId: string) {
    return (this.access.resolve as any).length >= 3
      ? (this.access.resolve as any)(guildId, channelId, userId, 'CHAT')
      : this.access.resolve({ guildId, profile, channelId, userId }, 'CHAT');
  }

  async beginRun(input: ChatRunInput): Promise<ChatRun> {
    const profile = parseAgentProfile(input.profile ?? 'PUBLIC');
    const initial = await this.resolveAdmission(input.guildId, profile, input.channelId, input.userId);
    if (!initial.allowed) throw new AgentQuotaError(initial.code);
    const roleMode = initial.settings?.accessMode === 'ROLE_QUOTAS';
    let lease: Lease | undefined;
    if (roleMode) {
      lease = (this.quota.acquireLease as any).length >= 3
        ? await this.quota.acquireLease({ guildId: input.guildId, profile }, input.userId, input.requestId)
        : await this.quota.acquireLease({ guildId: input.guildId, profile }, input.userId, input.requestId);
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (input.signal?.aborted) abort();
    input.signal?.addEventListener('abort', abort, { once: true });
    let closed = false;
    let heartbeatRunning = false;
    let spentTokens = 0;
    const initialUnlimited =
      profile === 'ADMIN' ||
      (initial.settings as any)?.tokenQuotaMode === 'UNLIMITED' ||
      initial.settings?.maxRunTokens === null;
    // Keep the original run ceiling when policy changes or midnight advances.
    const runLimit: number | null = initialUnlimited ? null : (initial.settings?.maxRunTokens ?? 32768);
    const timer = lease
      ? setInterval(() => {
          if (heartbeatRunning || closed) return;
          heartbeatRunning = true;
          void this.quota
            .heartbeat(lease!)
            .catch(abort)
            .finally(() => {
              heartbeatRunning = false;
            });
        }, 15000)
      : undefined;
    timer?.unref?.();

    const generate = async (request: AiGenerateRequest): Promise<AiGenerateResult> => {
      let policyRetries = 0;
      let providerRetries = 0;
      for (;;) {
        if (closed || controller.signal.aborted) throw new AgentQuotaError('LEASE_LOST');
        const decision = await this.resolveAdmission(input.guildId, profile, input.channelId, input.userId);
        if (!decision.allowed) throw new AgentQuotaError(decision.code);
        if ((decision.settings?.accessMode === 'ROLE_QUOTAS') !== roleMode) throw new AgentQuotaError('POLICY_CHANGED');
        const settings = decision.settings;
        const provider = input.provider(settings);
        const isUnlimited =
          profile === 'ADMIN' ||
          (settings as any)?.tokenQuotaMode === 'UNLIMITED' ||
          runLimit === null ||
          settings?.dailyGuildTokenLimit === null;

        const currentRunLimit: number | null = isUnlimited
          ? null
          : Math.min(runLimit!, settings?.maxRunTokens ?? runLimit!);
        const desiredCap = settings?.maxOutputTokens ?? 2048;

        const limits = {
          memberTokens: isUnlimited ? null : decision.allowance.dailyTokenLimit,
          memberImages: decision.allowance.dailyImageLimit,
          guildTokens: isUnlimited ? null : (settings?.dailyGuildTokenLimit ?? 0),
          guildImages: settings?.dailyGuildImageLimit ?? 0,
        };

        let dailyRemaining: number | null = null;
        if (!isUnlimited && lease) {
          try {
            const rem = await this.quota.remaining(
              { guildId: input.guildId, profile },
              lease,
              settings!.policyRevision,
              limits,
            );
            dailyRemaining = rem.tokens;
          } catch (error) {
            if (error instanceof AgentQuotaError && error.code === 'POLICY_CHANGED' && policyRetries++ < 2) continue;
            throw error;
          }
        }

        const runRemaining = currentRunLimit === null ? null : Math.max(0, currentRunLimit - spentTokens);
        const effectiveCapacity =
          isUnlimited
            ? null
            : dailyRemaining !== null && runRemaining !== null
              ? Math.min(dailyRemaining, runRemaining)
              : (dailyRemaining ?? runRemaining);

        let call: PreparedChatCall;
        try {
          const fitted = await fitChatRequest(
            request,
            async (candidate) => {
              const prepared = await provider.prepare(candidate, { profile, signal: controller.signal });
              // Backwards compatibility for test mocks returning legacy PreparedChatCall with inputAllowance
              if (!prepared.estimate && typeof (prepared as any).inputAllowance === 'number') {
                return Object.freeze({
                  ...prepared,
                  serializedBytes: Buffer.byteLength(prepared.body ?? '', 'utf8'),
                  estimate: {
                    inputTokens: (prepared as any).inputAllowance,
                    source: 'CONSERVATIVE_FALLBACK' as const,
                    counterVersion: 'legacy-mock:v1',
                    confidence: 'CONSERVATIVE' as const,
                  },
                });
              }
              return prepared;
            },
            { inputAndOutput: effectiveCapacity, outputCap: desiredCap },
          );
          call = fitted.call;
        } catch (error) {
          if (error instanceof InsufficientRequestCapacityError) {
            const inputTokens = error.details.inputTokens;
            const exhaustsRun = currentRunLimit !== null && spentTokens + inputTokens + 128 > currentRunLimit;
            const code = exhaustsRun ? 'RUN_BUDGET_EXHAUSTED' : 'QUOTA_EXHAUSTED';
            throw new AgentQuotaError(code, undefined, {
              profile,
              limitingScope: exhaustsRun ? 'RUN' : 'INPUT_CAPACITY',
              remaining: error.details.availableTokens,
              required: error.details.requiredTokens,
              countSource: error.details.estimate.source,
            });
          }
          throw error;
        }

        const inputAllowance = call.estimate?.inputTokens ?? (call as any).inputAllowance ?? 0;
        const reserved = inputAllowance + call.maxOutputTokens;
        const attemptId = randomUUID();
        let hasReservation = false;
        let dispatched = false;
        const tokenPolicy: TokenQuotaPolicy = isUnlimited
          ? { mode: 'UNLIMITED', guildLimit: null, memberLimit: null, runTokenLimit: null }
          : {
              mode: 'LIMITED',
              guildLimit: limits.guildTokens!,
              memberLimit: limits.memberTokens,
              runTokenLimit: currentRunLimit!,
            };

        if (lease) {
          try {
            await this.quota.reserve({
              attemptId,
              lease,
              profile,
              runId: input.runId,
              capability: 'CHAT',
              policyRevision: settings!.policyRevision,
              tokenPolicy,
              memberLimit: tokenPolicy.memberLimit,
              guildLimit: tokenPolicy.guildLimit,
              tokens: reserved,
              images: 0,
              runTokensUsed: spentTokens,
              runTokenLimit: tokenPolicy.runTokenLimit,
              estimate: call.estimate,
            });
            hasReservation = true;
          } catch (error) {
            if (error instanceof AgentQuotaError && error.code === 'POLICY_CHANGED' && policyRetries++ < 2) continue;
            throw error;
          }
        }
        const attemptController = new AbortController();
        const cancel = () => attemptController.abort();
        controller.signal.addEventListener('abort', cancel, { once: true });
        const deadline = setTimeout(cancel, 120000);
        deadline.unref?.();
        let response: AiGenerateResult;
        try {
          if (controller.signal.aborted) throw new ProviderCallError('PROVIDER_ABORTED', false);
          if (lease) await this.quota.markDispatched(attemptId, lease);
          dispatched = true;
          response = await provider.generatePrepared(call, attemptController.signal, request.onTextDelta);
        } catch (error) {
          const definite = error instanceof ProviderCallError && error.definiteRejection;
          const local = !dispatched || (error instanceof ProviderCallError && !error.dispatched);
          // Once marked dispatched, only a validated provider rejection can release the reservation.
          const refundable = definite || (!dispatched && local);
          const code = error instanceof ProviderCallError || error instanceof AgentQuotaError ? error.code : 'PROVIDER_ERROR';
          spentTokens += reserved;
          let charged = refundable ? 0 : reserved;
          if (hasReservation) {
            const settled = await this.quota.finalize(attemptId, {
              kind: definite ? 'REJECTED' : local && !dispatched ? 'LOCAL_FAILURE' : 'UNCERTAIN',
              code,
              definiteRejection: definite,
            });
            charged = Number(settled.chargedTokens);
          }
          spentTokens += charged - reserved;
          if (!dispatched && error instanceof AgentQuotaError && error.code === 'POLICY_CHANGED' && policyRetries++ < 2) continue;
          if (definite && /HTTP_429$/.test(code) && providerRetries++ < 5 && !controller.signal.aborted) {
            await this.backoff(Math.min(30000, 1000 * 2 ** (providerRetries - 1)), controller.signal);
            continue;
          }
          throw error;
        } finally {
          clearTimeout(deadline);
          controller.signal.removeEventListener('abort', cancel);
        }
        const measured = validateTokenUsage(response.usage);
        let charge = measured ?? reserved;
        // Assume the reservation remains spent until durable finalization succeeds; never retry a successful paid call.
        spentTokens += reserved;
        if (hasReservation) {
          const settled = await this.quota.finalize(attemptId, {
            kind: measured === null ? 'ESTIMATED' : 'REPORTED',
            tokens: charge,
            code: 'OK',
          });
          charge = Number(settled.chargedTokens);
        }
        spentTokens += charge - reserved;
        return { ...response, usage: { ...response.usage, totalTokens: charge } };
      }
    };
    let generating = false;
    return {
      get spentTokens() {
        return spentTokens;
      },
      generate: async (request) => {
        if (generating) throw new AgentQuotaError('BUSY');
        generating = true;
        try {
          return await generate(request);
        } finally {
          generating = false;
        }
      },
      close: async () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        controller.abort();
        input.signal?.removeEventListener('abort', abort);
        if (lease) await this.quota.releaseLease(lease);
      },
    };
  }

  private async backoff(ms: number, signal: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        reject(new AgentQuotaError('LEASE_LOST'));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, ms);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }
}
