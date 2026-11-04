import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AgentImageService } from './agent-image.service';
import { ImageProviderError } from './openai-image.provider';
import { chargeAttempt } from '../quota/agent-quota-accounting';

describe('quota-aware image generation', () => {
  let service: AgentImageService;
  let settings: any;
  let access: any;
  let quota: any;
  let provider: any;
  let attempts: any[];
  let outcomes: any[];
  const lease = { guildId: 'guild', userId: 'user', requestId: 'message', fence: 1n, expiresAt: new Date(Date.now() + 60000) };
  const input = { guildId: 'guild', channelId: 'channel', userId: 'user', messageId: 'message', prompt: 'bird', attachmentLimit: 8388608, canAttach: true };
  beforeEach(() => {
    attempts = []; outcomes = [];
    settings = { accessMode: 'ROLE_QUOTAS', policyRevision: 1n, imageEnabled: true, imageBaseUrl: 'https://provider.example/v1', imageModel: 'image-model', imageCredentialSource: 'SEPARATE', encryptedImageApiKey: 'encrypted-image', dailyGuildImageLimit: 10 };
    access = { resolve: jest.fn<any>(async () => ({ allowed: true, settings, allowance: { chatAllowed: false, imageAllowed: true, dailyImageLimit: 2 } })) };
    const keys = new Set();
    quota = { acquireLease: async () => lease, heartbeat: async () => {}, releaseLease: jest.fn<any>(async () => {}),
      reserve: async (attempt: any) => { if (keys.has(attempt.requestKey)) throw { code: 'P2002' }; keys.add(attempt.requestKey); attempts.push({ ...attempt, dispatchedAt: null }); },
      markDispatched: async (id: string) => { const found = attempts.find((a) => a.attemptId === id); if (found) found.dispatchedAt = new Date(); },
      finalize: async (id: string, outcome: any) => {
        const found = attempts.find((a) => a.attemptId === id) ?? { reservedTokens: 0n, reservedImages: 1n, dispatchedAt: null };
        const charge = chargeAttempt({ reservedTokens: BigInt(found.tokens ?? 0), reservedImages: BigInt(found.images ?? 1), dispatchedAt: found.dispatchedAt }, outcome);
        if (charge.images === 0n && found.requestKey) keys.delete(found.requestKey);
        outcomes.push({ ...outcome, chargedImages: charge.images });
      } };
    provider = { generate: jest.fn<any>(async (opts: any) => { await opts.onBeforeDispatch?.(); return { buffer: Buffer.from('validated-image'), extension: 'png' }; }) };
    service = new AgentImageService(access, quota, provider, { decryptApiKey: (value: string) => value ? 'decrypted-key' : undefined } as any);
  });
  it('allows an image-only role and settles before returning a fixed attachment', async () => {
    const result = await service.handle(input);
    expect(result.files?.[0]).toMatchObject({ name: 'nio-generated.png', attachment: Buffer.from('validated-image') });
    expect(result).not.toHaveProperty('conversationTurns');
    expect(attempts[0]).toMatchObject({ capability: 'IMAGE', tokens: 0, images: 1, requestKey: 'guild:message:IMAGE', memberLimit: 2, guildLimit: 10 });
    expect(outcomes).toEqual([{ kind: 'REPORTED', images: 1, code: 'OK', chargedImages: 1n }]);
    expect(quota.releaseLease).toHaveBeenCalledTimes(1);
  });
  it('deduplicates a message durably after the lease was released', async () => {
    await service.handle(input);
    const duplicate = await service.handle(input);
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(duplicate.files).toBeUndefined();
    expect(duplicate.content).toContain('sudah');
  });
  it.each(['ROLE_DENIED', 'ROLE_MODE_REQUIRED', 'CHANNEL_EXCLUDED', 'IMAGES_DISABLED'])('denies %s before generation', async (code) => {
    access.resolve.mockResolvedValue({ allowed: false, code });
    expect((await service.handle(input)).files).toBeUndefined();
    expect(provider.generate).not.toHaveBeenCalled();
    expect(attempts).toHaveLength(0);
  });
  it.each(['imageBaseUrl', 'imageModel', 'encryptedImageApiKey'])('denies missing %s before reservation', async (key) => {
    settings[key] = null;
    expect((await service.handle(input)).files).toBeUndefined();
    expect(provider.generate).not.toHaveBeenCalled();
    expect(attempts).toHaveLength(0);
  });
  it('denies known missing attachment permission before billing', async () => {
    await service.handle({ ...input, canAttach: false });
    expect(provider.generate).not.toHaveBeenCalled();
    expect(attempts).toHaveLength(0);
  });
  it('denies cross-origin chat-key reuse before decrypting or reserving', async () => {
    settings = { ...settings, imageCredentialSource: 'CHAT', provider: 'openai', baseUrl: 'https://chat.example/v1', encryptedApiKey: 'chat-key' };
    await service.handle(input);
    expect(provider.generate).not.toHaveBeenCalled();
    expect(attempts).toHaveLength(0);
  });
  it.each([
    { error: new ImageProviderError('IMAGE_HTTP_401', true, true), kind: 'REJECTED', dispatch: true, chargedImages: 0n },
    { error: new ImageProviderError('IMAGE_DESTINATION_DENIED', false), kind: 'LOCAL_FAILURE', dispatch: false, chargedImages: 0n },
    { error: new ImageProviderError('IMAGE_HTTP_503', true), kind: 'UNCERTAIN', dispatch: true, chargedImages: 1n },
    { error: new ImageProviderError('IMAGE_RASTER_INVALID', true), kind: 'UNCERTAIN', dispatch: true, chargedImages: 1n },
  ])('settles $kind with real charge $chargedImages and never automatically regenerates', async ({ error, kind, dispatch, chargedImages }) => {
    provider.generate.mockImplementation(async (opts: any) => { if (dispatch) await opts.onBeforeDispatch?.(); throw error; });
    expect((await service.handle(input)).files).toBeUndefined();
    expect(outcomes[0]).toMatchObject({ kind, chargedImages });
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(quota.releaseLease).toHaveBeenCalledTimes(1);
  });
  it('never returns bytes or retries success if durable settlement fails', async () => {
    quota.finalize = async () => { throw new Error('database offline'); };
    expect((await service.handle(input)).files).toBeUndefined();
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(quota.releaseLease).toHaveBeenCalledTimes(1);
  });
  it('refunds and re-evaluates on POLICY_CHANGED at pre-dispatch without duplicate requestKey collision', async () => {
    let dispatches = 0;
    quota.markDispatched = async (id: string) => {
      dispatches++;
      if (dispatches === 1) {
        const { AgentQuotaError } = await import('../quota/agent-quota.types');
        throw new AgentQuotaError('POLICY_CHANGED');
      }
      const found = attempts.find((a) => a.attemptId === id);
      if (found) found.dispatchedAt = new Date();
    };
    const result = await service.handle(input);
    expect(result.files?.[0]).toMatchObject({ name: 'nio-generated.png' });
    expect(attempts).toHaveLength(2);
    expect(outcomes).toEqual([
      { kind: 'LOCAL_FAILURE', code: 'POLICY_CHANGED', definiteRejection: false, chargedImages: 0n },
      { kind: 'REPORTED', images: 1, code: 'OK', chargedImages: 1n },
    ]);
  });
  it('records safe AgentRun events without raw prompt, key, or provider URL', async () => {
    const runs = { start: jest.fn<any>(async () => ({ id: 'run-1' })), finish: jest.fn<any>(async () => {}) };
    service = new AgentImageService(access, quota, provider, { decryptApiKey: () => 'secret-key' } as any, runs as any);
    await service.handle({ ...input, prompt: 'sensitive prompt text' });
    expect(runs.start).toHaveBeenCalledWith('guild', 'channel', 'user', 30);
    expect(runs.finish).toHaveBeenCalledWith('run-1', 'COMPLETED', 'Gambar selesai dibuat.');
    expect(JSON.stringify(runs.finish.mock.calls)).not.toContain('sensitive prompt text');
    expect(JSON.stringify(runs.finish.mock.calls)).not.toContain('secret-key');
  });
});
