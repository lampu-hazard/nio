import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Message } from 'discord.js';
import { AppLogger } from '../logger/logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordAnomalyService } from './discord-anomaly.service';
import { RustAnomalyClientService } from './rust-anomaly-client.service';

describe('DiscordAnomalyService', () => {
  let service: DiscordAnomalyService;
  let prisma: any;
  let logger: any;
  let rustClient: any;

  const makeMessage = (content = 'Hello', urls: string[] = []) => ({
    id: 'message-1',
    guild: { id: 'guild-1' },
    channel: { id: 'channel-1' },
    author: { bot: false, id: 'user-1' },
    content,
    delete: jest.fn(async () => {}),
  }) as unknown as Message;

  beforeEach(() => {
    prisma = {
      guildSettings: {
        findMany: jest.fn(async () => []),
        findUnique: jest.fn(async () => null),
      },
      user: {
        upsert: jest.fn(async () => ({ id: 'SYSTEM' })),
      },
      auditLog: {
        create: jest.fn(async () => ({ id: 'audit-1' })),
      },
    };
    logger = {
      log: jest.fn(),
      error: jest.fn(),
    };
    rustClient = {
      analyze: jest.fn(),
    };
    service = new DiscordAnomalyService(
      prisma as unknown as PrismaService,
      logger as unknown as AppLogger,
      rustClient as unknown as RustAnomalyClientService,
    );
  });

  it('passes sanity check', () => {
    expect(1).toBe(1);
  });

  it('allows message if anomaly detection is disabled', async () => {
    const message = makeMessage();
    service.updateGuildCache('guild-1', {
      enabled: false,
      phishingEnabled: true,
      contentAnomalyEnabled: true,
      userAnomalyEnabled: true,
      guildBaselineEnabled: true,
      enforcementMode: 'AUDIT_ONLY',
    });

    await service.handleMessage(message);

    expect(rustClient.analyze).not.toHaveBeenCalled();
  });

  it('calls rust client if enabled and deletes message when critical finding occurs in DELETE_HIGH_CONFIDENCE mode', async () => {
    const message = makeMessage('Claim free discord nitro here fast! https://claim-free-discord-nitro.ru');
    service.updateGuildCache('guild-1', {
      enabled: true,
      phishingEnabled: true,
      contentAnomalyEnabled: true,
      userAnomalyEnabled: true,
      guildBaselineEnabled: true,
      enforcementMode: 'DELETE_HIGH_CONFIDENCE',
    });

    rustClient.analyze.mockResolvedValue({
      decision: 3, // DELETE_MESSAGE
      severity: 4, // CRITICAL
      confidence: 0.95,
      reason: 'Phishing link detected: Suspicious link containing phishing patterns',
      findings: [
        {
          kind: 1, // FINDING_KIND_PHISHING_LINK
          severity: 4,
          confidence: 0.95,
          reason: 'Suspicious link containing phishing patterns',
          evidence: { domain: 'claim-free-discord-nitro.ru' },
        },
      ],
      metrics: {
        messages_in_60s: 1,
        unique_users_in_60s: 1,
      },
    });

    await service.handleMessage(message);

    expect(rustClient.analyze).toHaveBeenCalledWith({
      guildId: 'guild-1',
      channelId: 'channel-1',
      userId: 'user-1',
      messageId: 'message-1',
      content: 'Claim free discord nitro here fast! https://claim-free-discord-nitro.ru',
      urls: ['https://claim-free-discord-nitro.ru'],
      timestampMs: expect.any(Number),
      config: {
        phishingEnabled: true,
        contentAnomalyEnabled: true,
        userAnomalyEnabled: true,
        guildBaselineEnabled: true,
        enforcementMode: 2, // DELETE_HIGH_CONFIDENCE
      },
    });

    expect(message.delete).toHaveBeenCalled();
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { id: 'SYSTEM' },
      update: {},
      create: {
        id: 'SYSTEM',
        username: 'System',
        globalName: 'System',
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        guildId: 'guild-1',
        userId: 'SYSTEM',
        action: 'ANOMALY_DETECTION',
        metadata: {
          channelId: 'channel-1',
          offenderId: 'user-1',
          decision: 'DELETE_MESSAGE',
          severity: 'CRITICAL',
          confidence: 0.95,
          reason: 'Phishing link detected: Suspicious link containing phishing patterns',
          findings: [
            {
              kind: 1,
              severity: 4,
              confidence: 0.95,
              reason: 'Suspicious link containing phishing patterns',
              evidence: { domain: 'claim-free-discord-nitro.ru' },
            },
          ],
          metrics: {
            messages_in_60s: 1,
            unique_users_in_60s: 1,
          },
        },
      },
    });
  });

  it('does not delete message in AUDIT_ONLY mode but still logs it', async () => {
    const message = makeMessage('Claim free discord nitro here fast! https://claim-free-discord-nitro.ru');
    service.updateGuildCache('guild-1', {
      enabled: true,
      phishingEnabled: true,
      contentAnomalyEnabled: true,
      userAnomalyEnabled: true,
      guildBaselineEnabled: true,
      enforcementMode: 'AUDIT_ONLY',
    });

    rustClient.analyze.mockResolvedValue({
      decision: 3, // DELETE_MESSAGE
      severity: 4, // CRITICAL
      confidence: 0.95,
      reason: 'Phishing link detected: Suspicious link containing phishing patterns',
      findings: [
        {
          kind: 1,
          severity: 4,
          confidence: 0.95,
          reason: 'Suspicious link containing phishing patterns',
          evidence: { domain: 'claim-free-discord-nitro.ru' },
        },
      ],
      metrics: {
        messages_in_60s: 1,
        unique_users_in_60s: 1,
      },
    });

    await service.handleMessage(message);

    expect(rustClient.analyze).toHaveBeenCalled();
    expect(message.delete).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});
