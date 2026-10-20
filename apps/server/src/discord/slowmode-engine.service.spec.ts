import { beforeEach, describe, expect, it } from '@jest/globals';
import { SlowmodeEngineService } from './slowmode-engine.service';

describe('SlowmodeEngineService', () => {
  let service: SlowmodeEngineService;
  const config = { quietSeconds: 0, normalSeconds: 5, busySeconds: 15 };

  beforeEach(() => {
    service = new SlowmodeEngineService();
  });

  it('keeps channel QUIET on first message', () => {
    const res = service.analyze('g1', 'c1', 'u1', 10000, 0, config);
    expect(res.level).toBe('QUIET');
    expect(res.recommendedSeconds).toBe(0);
    expect(res.shouldApply).toBe(false);
    expect(res.metrics.messagesIn10s).toBe(1);
    expect(res.metrics.messagesIn60s).toBe(1);
    expect(res.metrics.uniqueUsersIn60s).toBe(1);
  });

  it('escalates to NORMAL when 3 messages arrive within 10s', () => {
    service.analyze('g1', 'c1', 'u1', 10000, 0, config);
    service.analyze('g1', 'c1', 'u2', 11000, 0, config);
    const res = service.analyze('g1', 'c1', 'u3', 12000, 0, config);

    expect(res.level).toBe('NORMAL');
    expect(res.recommendedSeconds).toBe(5);
    expect(res.shouldApply).toBe(true);
    expect(res.metrics.messagesIn10s).toBe(3);
    expect(res.metrics.uniqueUsersIn60s).toBe(3);
  });

  it('escalates to BUSY when 8 messages arrive within 10s', () => {
    for (let i = 0; i < 7; i++) {
      service.analyze('g1', 'c1', `u${i}`, 10000 + i * 500, 5, config);
    }
    const res = service.analyze('g1', 'c1', 'u7', 14000, 5, config);

    expect(res.level).toBe('BUSY');
    expect(res.recommendedSeconds).toBe(15);
    expect(res.shouldApply).toBe(true);
    expect(res.metrics.messagesIn10s).toBe(8);
  });

  it('ignores SYSTEM checks from counting towards message volume', () => {
    service.analyze('g1', 'c1', 'u1', 10000, 0, config);
    const res = service.analyze('g1', 'c1', 'SYSTEM', 10500, 0, config);

    expect(res.metrics.messagesIn10s).toBe(1);
    expect(res.metrics.messagesIn60s).toBe(1);
  });

  it('prunes messages older than 60 seconds and returns to QUIET', () => {
    service.analyze('g1', 'c1', 'u1', 10000, 0, config);
    service.analyze('g1', 'c1', 'u2', 11000, 0, config);
    service.analyze('g1', 'c1', 'u3', 12000, 0, config);

    const res = service.analyze('g1', 'c1', 'SYSTEM', 75000, 5, config);
    expect(res.level).toBe('QUIET');
    expect(res.recommendedSeconds).toBe(0);
    expect(res.shouldApply).toBe(true);
    expect(res.metrics.messagesIn10s).toBe(0);
    expect(res.metrics.messagesIn60s).toBe(0);
  });
});
