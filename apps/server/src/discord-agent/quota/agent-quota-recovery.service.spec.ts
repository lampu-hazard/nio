import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AgentQuotaRecoveryService } from './agent-quota-recovery.service';

describe('quota recovery lifecycle', () => {
  afterEach(() => { jest.useRealTimers(); });
  it('recovers on startup, every 30 seconds, and stops on destruction', async () => {
    jest.useFakeTimers();
    let recoveries = 0;
    let cleanups = 0;
    const service = new AgentQuotaRecoveryService({ recoverExpired: async () => { recoveries++; }, cleanup: async () => { cleanups++; } } as any);
    await service.onModuleInit();
    expect(recoveries).toBe(1);
    expect(cleanups).toBe(1);
    await jest.advanceTimersByTimeAsync(30000);
    expect(recoveries).toBe(2);
    service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(60000);
    expect(recoveries).toBe(2);
  });
  it('does not overlap a slow recovery pass', async () => {
    jest.useFakeTimers();
    let finish!: () => void;
    let calls = 0;
    const service = new AgentQuotaRecoveryService({ recoverExpired: async () => { calls++; await new Promise<void>((resolve) => { finish = resolve; }); }, cleanup: async () => {} } as any);
    const startup = service.onModuleInit();
    await jest.advanceTimersByTimeAsync(90000);
    expect(calls).toBe(1);
    finish();
    await startup;
    service.onModuleDestroy();
  });
});
