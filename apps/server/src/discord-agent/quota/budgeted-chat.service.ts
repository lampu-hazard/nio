import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AgentAccessService, AdmissionDecision } from '../agent-access.service';
import { AgentQuotaService } from './agent-quota.service';
import { AgentQuotaError, Lease } from './agent-quota.types';
import { AiGenerateRequest, AiGenerateResult, AiProvider, PreparedChatCall } from '../interfaces/ai-provider.interface';
import { ProviderCallError, validateTokenUsage } from '../providers/chat-request-budget';

type Settings = Extract<AdmissionDecision, { allowed: true }>['settings'];
export interface BoundedAiProvider extends AiProvider {
  prepare(request: AiGenerateRequest): PreparedChatCall;
  generatePrepared(call: PreparedChatCall, signal?: AbortSignal, onTextDelta?: AiGenerateRequest['onTextDelta']): Promise<AiGenerateResult>;
}
export type ChatRunInput = {
  guildId: string; channelId: string; userId: string; requestId: string; runId?: string;
  provider: (settings: Settings) => BoundedAiProvider; signal?: AbortSignal;
};
export type ChatRun = {
  readonly spentTokens: number;
  generate(request: AiGenerateRequest): Promise<AiGenerateResult>;
  close(): Promise<void>;
};

@Injectable()
export class BudgetedChatService {
  constructor(private readonly access: AgentAccessService, private readonly quota: AgentQuotaService) {}

  async beginRun(input: ChatRunInput): Promise<ChatRun> {
    const initial = await this.access.resolve(input.guildId, input.channelId, input.userId, 'CHAT');
    if (!initial.allowed) throw new AgentQuotaError(initial.code);
    const roleMode = initial.settings?.accessMode === 'ROLE_QUOTAS';
    let lease: Lease | undefined;
    if (roleMode) lease = await this.quota.acquireLease(input.guildId, input.userId, input.requestId);
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (input.signal?.aborted) abort();
    input.signal?.addEventListener('abort', abort, { once: true });
    let closed = false;
    let heartbeatRunning = false;
    let spentTokens = 0;
    // Keep the original run ceiling when policy changes or midnight advances.
    const runLimit = initial.settings?.maxRunTokens ?? 32768;
    const timer = lease ? setInterval(() => {
      if (heartbeatRunning || closed) return;
      heartbeatRunning = true;
      void this.quota.heartbeat(lease!).catch(abort).finally(() => { heartbeatRunning = false; });
    }, 15000) : undefined;
    timer?.unref?.();

    const generate = async (request: AiGenerateRequest): Promise<AiGenerateResult> => {
      let policyRetries = 0;
      let providerRetries = 0;
      for (;;) {
        if (closed || controller.signal.aborted) throw new AgentQuotaError('LEASE_LOST');
        const decision = await this.access.resolve(input.guildId, input.channelId, input.userId, 'CHAT');
        if (!decision.allowed) throw new AgentQuotaError(decision.code);
        if ((decision.settings?.accessMode === 'ROLE_QUOTAS') !== roleMode) throw new AgentQuotaError('POLICY_CHANGED');
        const settings = decision.settings;
        const provider = input.provider(settings);
        const currentRunLimit = Math.min(runLimit, settings?.maxRunTokens ?? runLimit);
        let capacity = currentRunLimit - spentTokens;
        const limits = { memberTokens: decision.allowance.dailyTokenLimit, memberImages: decision.allowance.dailyImageLimit,
          guildTokens: settings?.dailyGuildTokenLimit ?? 0, guildImages: settings?.dailyGuildImageLimit ?? 0 };
        try {
          if (lease) capacity = Math.min(capacity, (await this.quota.remaining(lease, settings!.policyRevision, limits)).tokens);
        } catch (error) {
          if (error instanceof AgentQuotaError && error.code === 'POLICY_CHANGED' && policyRetries++ < 2) continue;
          throw error;
        }
        let cap = settings?.maxOutputTokens ?? 2048;
        let call = provider.prepare({ ...request, maxOutputTokens: cap });
        // Re-prepare after shrinking because the cap's JSON digits are part of the input estimate.
        while (call.inputAllowance + cap > capacity && cap >= 128) {
          cap = Math.min(cap - 1, Math.floor(capacity - call.inputAllowance));
          if (cap < 128) throw new AgentQuotaError(spentTokens + call.inputAllowance + 128 > currentRunLimit ? 'RUN_BUDGET_EXHAUSTED' : 'QUOTA_EXHAUSTED');
          call = provider.prepare({ ...request, maxOutputTokens: cap });
        }
        const reserved = call.inputAllowance + cap;
        const attemptId = randomUUID();
        let hasReservation = false;
        let dispatched = false;
        if (lease) {
          try {
            await this.quota.reserve({ attemptId, lease, runId: input.runId, capability: 'CHAT', policyRevision: settings!.policyRevision,
              memberLimit: limits.memberTokens, guildLimit: limits.guildTokens, tokens: reserved, images: 0,
              runTokensUsed: spentTokens, runTokenLimit: currentRunLimit });
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
            const settled = await this.quota.finalize(attemptId, { kind: definite ? 'REJECTED' : local && !dispatched ? 'LOCAL_FAILURE' : 'UNCERTAIN',
              code, definiteRejection: definite });
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
          const settled = await this.quota.finalize(attemptId, { kind: measured === null ? 'ESTIMATED' : 'REPORTED', tokens: charge, code: 'OK' });
          charge = Number(settled.chargedTokens);
        }
        spentTokens += charge - reserved;
        return { ...response, usage: { ...response.usage, totalTokens: charge } };
      }
    };
    let generating = false;
    return {
      get spentTokens() { return spentTokens; },
      generate: async (request) => {
        if (generating) throw new AgentQuotaError('BUSY');
        generating = true;
        try { return await generate(request); }
        finally { generating = false; }
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
      const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new AgentQuotaError('LEASE_LOST')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }
}
