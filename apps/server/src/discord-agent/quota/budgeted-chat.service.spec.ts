import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BudgetedChatService } from './budgeted-chat.service';
import { prepareChatBody, ProviderCallError } from '../providers/chat-request-budget';

// Persisted concurrency has its own opt-in PostgreSQL tests. These exercise the paid-call boundary.
describe('budgeted chat calls', () => {
  let access: any;
  let quota: any;
  let provider: any;
  let service: BudgetedChatService;
  let sends: number;
  let outcomes: any[];
  let reservations: any[];
  let settings: any;
  const request = { systemPrompt: 'system', messages: [{ role: 'user' as const, parts: [{ type: 'text' as const, text: 'hi' }] }], tools: [] };
  const lease = { guildId: 'guild', userId: 'user', requestId: 'request', fence: 1n, expiresAt: new Date(Date.now() + 60000) };
  beforeEach(() => {
    sends = 0; outcomes = []; reservations = [];
    settings = { profile: 'PUBLIC', tokenQuotaMode: 'LIMITED', accessMode: 'ROLE_QUOTAS', policyRevision: 1n, maxOutputTokens: 2048, maxRunTokens: 32768, dailyGuildTokenLimit: 100000, dailyGuildImageLimit: 100 };
    access = { resolve: jest.fn<any>(async () => ({ allowed: true, settings, allowance: { dailyTokenLimit: 100000, dailyImageLimit: 5 } })) };
    quota = {
      acquireLease: async () => lease, releaseLease: jest.fn<any>(async () => {}), heartbeat: async () => {},
      remaining: async () => ({ tokens: 100000, images: 5 }),
      reserve: async (input: any) => { reservations.push(input); return { id: input.attemptId }; },
      markDispatched: async () => {},
      finalize: async (_id: string, outcome: any) => { outcomes.push(outcome); return { chargedTokens: BigInt(outcome.tokens ?? reservations[reservations.length - 1].tokens) }; },
    };
    provider = {
      prepare: async (r: any) => {
        const cap = r.maxOutputTokens ?? 2048;
        const payload = { ...r, onTextDelta: undefined, signal: undefined };
        const serializedBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
        return prepareChatBody(payload, cap, {
          inputTokens: serializedBytes + 1024 + 64 * ((r.messages?.length ?? 0) + (r.tools?.length ?? 0)),
          source: 'MODEL_TOKENIZER',
          counterVersion: 'test:v1',
          confidence: 'ESTIMATED',
        });
      },
      generatePrepared: async () => { sends++; return { message: { role: 'assistant', parts: [{ type: 'text', text: 'ok' }] }, usage: { totalTokens: 20 } }; },
    };
    service = new BudgetedChatService(access, quota);
  });
  afterEach(() => { jest.useRealTimers(); });
  const args = () => ({ guildId: 'guild', profile: 'PUBLIC' as const, channelId: 'channel', userId: 'user', requestId: 'request', provider: () => provider });

  it('executes ADMIN with unlimited token mode without querying remaining daily tokens or enforcing run token limits', async () => {
    settings = {
      profile: 'ADMIN',
      tokenQuotaMode: 'UNLIMITED',
      accessMode: 'ROLE_QUOTAS',
      policyRevision: 1n,
      maxOutputTokens: 2048,
      maxRunTokens: null,
      dailyGuildTokenLimit: null,
      dailyGuildImageLimit: 10,
    };
    access.resolve.mockResolvedValue({ allowed: true, settings, allowance: { dailyTokenLimit: null, dailyImageLimit: 5 } });
    quota.remaining = jest.fn<any>(async () => { throw new Error('ADMIN should not check remaining token quota'); });
    const run = await service.beginRun({ ...args(), profile: 'ADMIN' });
    try {
      await run.generate(request);
      expect(sends).toBe(1);
      expect(reservations[0]).toMatchObject({
        profile: 'ADMIN',
        tokenPolicy: { mode: 'UNLIMITED', guildLimit: null, memberLimit: null, runTokenLimit: null },
      });
    } finally {
      await run.close();
    }
  });

  it('accounts each loop and synthesis call toward the same run budget', async () => {
    const run = await service.beginRun(args());
    try {
      for (const total of [20, 30, 15]) {
        provider.generatePrepared = async () => { sends++; return { message: { role: 'assistant', parts: [] }, usage: { totalTokens: total } }; };
        await run.generate(request);
      }
      expect(run.spentTokens).toBe(65);
      expect(outcomes.map((o) => o.tokens)).toEqual([20, 30, 15]);
      expect(new Set(reservations.map((r) => r.attemptId)).size).toBe(3);
    } finally { await run.close(); }
  });
  it('rechecks role admission before the next paid step', async () => {
    const run = await service.beginRun(args());
    try {
      await run.generate(request);
      access.resolve.mockResolvedValue({ allowed: false, code: 'ROLE_DENIED' });
      await expect(run.generate(request)).rejects.toMatchObject({ code: 'ROLE_DENIED' });
      expect(sends).toBe(1);
    } finally { await run.close(); }
  });
  it('refuses image-only members before lease acquisition', async () => {
    access.resolve.mockResolvedValue({ allowed: false, code: 'ROLE_DENIED' });
    await expect(service.beginRun(args())).rejects.toMatchObject({ code: 'ROLE_DENIED' });
    expect(sends).toBe(0);
  });
  it('shrinks output while still reserving the full serialized input', async () => {
    quota.remaining = async () => ({ tokens: 2000, images: 0 });
    const run = await service.beginRun(args());
    try {
      await run.generate(request);
      expect(reservations[0].tokens).toBeLessThanOrEqual(2000);
      expect(reservations[0].tokens).toBeGreaterThan(128);
    } finally { await run.close(); }
  });
  it('refuses synthesis when even minimum output plus input cannot fit', async () => {
    quota.remaining = async () => ({ tokens: 128, images: 0 });
    const run = await service.beginRun(args());
    try {
      await expect(run.generate(request)).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
      expect(sends).toBe(0);
      expect(reservations).toHaveLength(0);
    } finally { await run.close(); }
  });
  it('charges missing usage using the full persisted reservation', async () => {
    provider.generatePrepared = async () => { sends++; return { message: { role: 'assistant', parts: [] } }; };
    const run = await service.beginRun(args());
    try {
      await run.generate(request);
      expect(outcomes[0]).toMatchObject({ kind: 'ESTIMATED', tokens: reservations[0].tokens });
      expect(run.spentTokens).toBe(reservations[0].tokens);
    } finally { await run.close(); }
  });
  it('does not retry ambiguous 503 failures', async () => {
    provider.generatePrepared = async () => { sends++; throw new ProviderCallError('OPENAI_HTTP_503', true); };
    const run = await service.beginRun(args());
    try {
      await expect(run.generate(request)).rejects.toMatchObject({ code: 'OPENAI_HTTP_503' });
      expect(sends).toBe(1);
      expect(outcomes[0].kind).toBe('UNCERTAIN');
    } finally { await run.close(); }
  });
  it.each(['reserve', 'markDispatched'])('never sends when %s fails', async (method) => {
    quota[method] = async () => { throw new Error('database offline'); };
    const run = await service.beginRun(args());
    try {
      await expect(run.generate(request)).rejects.toThrow('database offline');
      expect(sends).toBe(0);
    } finally { await run.close(); }
  });
  it('does not refund or replay provider success when finalization fails', async () => {
    quota.finalize = async () => { throw new Error('database offline'); };
    const run = await service.beginRun(args());
    try {
      await expect(run.generate(request)).rejects.toThrow('database offline');
      expect(sends).toBe(1);
      expect(run.spentTokens).toBe(reservations[0].tokens);
    } finally { await run.close(); }
  });
  it('aborts in-flight work on heartbeat loss and releases the fenced lease', async () => {
    jest.useFakeTimers();
    quota.heartbeat = async () => { throw new Error('lease lost'); };
    provider.generatePrepared = async (_call: any, signal: AbortSignal) => new Promise((_resolve, reject) => {
      sends++; signal.addEventListener('abort', () => reject(new ProviderCallError('PROVIDER_ABORTED', true)), { once: true });
    });
    const run = await service.beginRun(args());
    const result = run.generate(request).catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(15000);
    expect(await result).toMatchObject({ code: 'PROVIDER_ABORTED' });
    await run.close();
    expect(quota.releaseLease).toHaveBeenCalledWith(lease);
    expect(outcomes[0].kind).toBe('UNCERTAIN');
  });
  it('uses the durable charge when recovery finalized an attempt before the response arrived', async () => {
    quota.finalize = async () => ({ chargedTokens: 5000n });
    const run = await service.beginRun(args());
    try {
      const response = await run.generate(request);
      expect(run.spentTokens).toBe(5000);
      expect(response.usage?.totalTokens).toBe(5000);
    } finally { await run.close(); }
  });
  it('rejects overlapping calls on the same run before either can bypass run-wide spend', async () => {
    const finishes: ((result: any) => void)[] = [];
    provider.generatePrepared = async () => { sends++; return new Promise((resolve) => { finishes.push(resolve); }); };
    const run = await service.beginRun(args());
    const first = run.generate(request);
    const second = run.generate(request).catch((error: unknown) => error);
    for (let i = 0; i < 30; i++) await Promise.resolve();
    for (const finish of finishes) finish({ message: { role: 'assistant', parts: [] }, usage: { totalTokens: 20 } });
    try {
      await first;
      expect(await second).toMatchObject({ code: 'BUSY' });
      expect(sends).toBe(1);
    } finally { await run.close(); }
  });
  it('retries a definitive 429 only after settlement with a fresh policy and attempt', async () => {
    jest.useFakeTimers();
    let calls = 0;
    provider.generatePrepared = async () => {
      sends++;
      if (calls++ === 0) throw new ProviderCallError('OPENAI_HTTP_429', true, true);
      return { message: { role: 'assistant', parts: [] }, usage: { totalTokens: 20 } };
    };
    quota.finalize = async (_id: string, outcome: any) => {
      outcomes.push(outcome);
      return { chargedTokens: BigInt(outcome.kind === 'REJECTED' ? 0 : outcome.tokens) };
    };
    const run = await service.beginRun(args());
    try {
      const result = run.generate(request);
      await jest.advanceTimersByTimeAsync(1000);
      await result;
      expect(sends).toBe(2);
      expect(reservations).toHaveLength(2);
      expect(reservations[0].attemptId).not.toBe(reservations[1].attemptId);
      expect(outcomes.map((o) => o.kind)).toEqual(['REJECTED', 'REPORTED']);
      expect(access.resolve.mock.calls).toHaveLength(3);
      expect(run.spentTokens).toBe(20);
    } finally { await run.close(); }
  });
  it('refreshes policy and the provider snapshot after a pre-dispatch revision conflict', async () => {
    let marks = 0;
    quota.markDispatched = async () => {
      if (marks++ === 0) {
        settings = { ...settings, policyRevision: 2n, model: 'replacement-model' };
        const { AgentQuotaError } = await import('./agent-quota.types');
        throw new AgentQuotaError('POLICY_CHANGED');
      }
    };
    quota.finalize = async (_id: string, outcome: any) => {
      outcomes.push(outcome);
      return { chargedTokens: BigInt(outcome.kind === 'LOCAL_FAILURE' ? 0 : outcome.tokens) };
    };
    const models: (string | undefined)[] = [];
    const run = await service.beginRun({ ...args(), provider: (snapshot) => { models.push(snapshot?.model); return provider; } });
    try {
      await run.generate(request);
      expect(sends).toBe(1);
      expect(reservations.map((r) => r.policyRevision)).toEqual([1n, 2n]);
      expect(outcomes.map((o) => o.kind)).toEqual(['LOCAL_FAILURE', 'REPORTED']);
      expect(models).toEqual([undefined, 'replacement-model']);
      expect(run.spentTokens).toBe(20);
    } finally { await run.close(); }
  });
  it('keeps the original run budget across midnight and a larger replacement policy', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-04T23:59:59Z') });
    settings.maxRunTokens = 4000;
    provider.generatePrepared = async () => ({ message: { role: 'assistant', parts: [] }, usage: { totalTokens: 3000 } });
    const run = await service.beginRun(args());
    try {
      await run.generate(request);
      jest.setSystemTime(new Date('2026-11-05T00:00:01Z'));
      settings = { ...settings, policyRevision: 2n, maxRunTokens: 100000 };
      await expect(run.generate(request)).rejects.toMatchObject({ code: 'RUN_BUDGET_EXHAUSTED' });
      expect(reservations).toHaveLength(1);
    } finally { await run.close(); }
  });
  it('never enlarges the run ceiling for unlimited members on their first call', async () => {
    settings.maxRunTokens = 2048;
    access.resolve.mockImplementation(async () => ({ allowed: true, settings, allowance: { dailyTokenLimit: null, dailyImageLimit: 0 } }));
    const run = await service.beginRun(args());
    try {
      const large = { ...request, systemPrompt: 'x'.repeat(5000) };
      await expect(run.generate(large)).rejects.toMatchObject({ code: 'RUN_BUDGET_EXHAUSTED' });
      expect(sends).toBe(0);
      expect(reservations).toHaveLength(0);
    } finally { await run.close(); }
  });
  it('keeps an equal output/run cap valid by shrinking output rather than bypassing the run cap', async () => {
    settings.maxRunTokens = 2048;
    const run = await service.beginRun(args());
    try {
      await run.generate(request);
      expect(reservations[0].tokens).toBeLessThanOrEqual(2048);
      expect(reservations[0].runTokenLimit).toBe(2048);
    } finally { await run.close(); }
  });
  it('blocks switching an active run from quota mode to legacy mode', async () => {
    const run = await service.beginRun(args());
    try {
      settings = { ...settings, accessMode: 'LEGACY_USERS' };
      await expect(run.generate(request)).rejects.toMatchObject({ code: 'POLICY_CHANGED' });
      expect(sends).toBe(0);
    } finally { await run.close(); }
  });
});
