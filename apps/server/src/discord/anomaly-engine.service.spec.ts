import { beforeEach, describe, expect, it } from '@jest/globals';
import { AnomalyEngineService } from './anomaly-engine.service';

describe('AnomalyEngineService', () => {
  let service: AnomalyEngineService;
  const baseConfig = {
    phishingEnabled: true,
    contentAnomalyEnabled: true,
    userAnomalyEnabled: true,
    guildBaselineEnabled: true,
    enforcementMode: 2,
  };

  beforeEach(() => {
    service = new AnomalyEngineService();
  });

  it('allows clean messages without anomalies', () => {
    const res = service.analyze({
      guildId: 'g1',
      channelId: 'c1',
      userId: 'u1',
      messageId: 'm1',
      content: 'Hello everyone!',
      urls: [],
      timestampMs: 10000,
      config: baseConfig,
    });

    expect(res.decision).toBe(1); // ALLOW
    expect(res.severity).toBe(0); // UNSPECIFIED
    expect(res.findings).toHaveLength(0);
  });

  it('detects phishing links and issues DELETE_MESSAGE', () => {
    const res = service.analyze({
      guildId: 'g1',
      channelId: 'c1',
      userId: 'u1',
      messageId: 'm1',
      content: 'Get free nitro: https://free-discord-nitro.ru/gift',
      urls: ['https://free-discord-nitro.ru/gift'],
      timestampMs: 10000,
      config: baseConfig,
    });

    expect(res.decision).toBe(3); // DELETE_MESSAGE
    expect(res.severity).toBe(4); // CRITICAL
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0].kind).toBe(1); // PHISHING_LINK
    expect(res.findings[0].evidence.domain).toBe('free-discord-nitro.ru');
  });

  it('does not flag trusted discord domains as phishing', () => {
    const res = service.analyze({
      guildId: 'g1',
      channelId: 'c1',
      userId: 'u1',
      messageId: 'm1',
      content: 'Official link: https://discord.com/nitro/gift',
      urls: ['https://discord.com/nitro/gift'],
      timestampMs: 10000,
      config: baseConfig,
    });

    expect(res.decision).toBe(1); // ALLOW
    expect(res.findings).toHaveLength(0);
  });

  it('detects excessive mentions and flags for AUDIT', () => {
    const res = service.analyze({
      guildId: 'g1',
      channelId: 'c1',
      userId: 'u1',
      messageId: 'm1',
      content: 'Hey <@1> <@2> <@3> <@4> <@5> check this out',
      urls: [],
      timestampMs: 10000,
      config: baseConfig,
    });

    expect(res.decision).toBe(2); // AUDIT
    expect(res.severity).toBe(3); // HIGH
    expect(res.findings[0].kind).toBe(2); // CONTENT_ANOMALY
  });

  it('detects rapid user spam (> 10 messages within 60s)', () => {
    for (let i = 0; i < 10; i++) {
      service.analyze({
        guildId: 'g1',
        channelId: 'c1',
        userId: 'spammer',
        messageId: `msg-${i}`,
        content: `spam ${i}`,
        urls: [],
        timestampMs: 10000 + i * 1000,
        config: baseConfig,
      });
    }

    const res = service.analyze({
      guildId: 'g1',
      channelId: 'c1',
      userId: 'spammer',
      messageId: 'msg-11',
      content: 'spam 11',
      urls: [],
      timestampMs: 25000,
      config: baseConfig,
    });

    expect(res.findings.some((f) => f.kind === 3)).toBe(true); // USER_ANOMALY
  });
});
