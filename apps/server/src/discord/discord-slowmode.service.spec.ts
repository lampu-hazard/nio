import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import { Message, TextChannel } from 'discord.js';
import { AppLogger } from '../logger/logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordSlowmodeService } from './discord-slowmode.service';
import { RustSlowmodeClientService } from './rust-slowmode-client.service';

describe('DiscordSlowmodeService', () => {
  let service: DiscordSlowmodeService;
  let prisma: any;
  let logger: any;
  let rustClient: any;

  const makeChannel = (rateLimitPerUser = 5) => ({
    id: 'channel-1',
    name: 'general',
    rateLimitPerUser,
    setRateLimitPerUser: jest.fn(async function (this: any, seconds: number) {
      this.rateLimitPerUser = seconds;
      return this;
    }),
  }) as unknown as TextChannel;

  const makeMessage = (channel: TextChannel) => ({
    guild: { id: 'guild-1' },
    channel,
    author: { bot: false, id: 'user-1' },
  }) as unknown as Message;

  const makeClient = (channel: TextChannel) => ({
    channels: {
      cache: { get: jest.fn<(id: string) => TextChannel>(() => channel) },
      fetch: jest.fn(),
    },
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    prisma = {
      guildSettings: {
        findMany: jest.fn(async () => []),
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
    service = new DiscordSlowmodeService(
      prisma as unknown as PrismaService,
      logger as unknown as AppLogger,
      rustClient as unknown as RustSlowmodeClientService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('sets busy slowmode after Rust analyze recommends an update', async () => {
    const channel = makeChannel(5);
    const message = makeMessage(channel);

    service.updateGuildCache('guild-1', {
      slowmodeEnabled: true,
      slowmodeChannels: ['channel-1'],
      slowmodeIntervalQuiet: 5,
      slowmodeIntervalNormal: 8,
      slowmodeIntervalBusy: 10,
    });

    rustClient.analyze.mockResolvedValue({
      level: 'BUSY',
      recommendedSeconds: 10,
      shouldApply: true,
      reason: 'Busy Chat Detected',
      metrics: {
        messagesIn10s: 15,
        messagesIn60s: 40,
        uniqueUsersIn60s: 5,
      },
    });

    await service.handleMessage(message);

    expect(rustClient.analyze).toHaveBeenCalledWith(
      'guild-1',
      'channel-1',
      'user-1',
      expect.any(Number),
      5,
      { quietSeconds: 5, normalSeconds: 8, busySeconds: 10 },
    );
    expect(channel.setRateLimitPerUser).toHaveBeenCalledWith(10, 'BUSY - Busy Chat Detected');
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
        action: 'SLOWMODE_LEVEL_CHANGED',
        metadata: {
          channelId: 'channel-1',
          fromLevel: 'QUIET',
          toLevel: 'BUSY',
          previousSeconds: 5,
          recommendedSeconds: 10,
          messagesIn10s: 15,
          messagesIn60s: 40,
          uniqueUsersIn60s: 5,
          reason: 'Busy Chat Detected',
        },
      },
    });
  });

  it('resolves configured channels from the Discord client for inactivity resets', async () => {
    const channel = makeChannel(10);
    const client = makeClient(channel);

    service.setClient(client as any);
    await service.onModuleInit();
    service.updateGuildCache('guild-1', {
      slowmodeEnabled: true,
      slowmodeChannels: ['channel-1'],
      slowmodeIntervalQuiet: 5,
      slowmodeIntervalNormal: 8,
      slowmodeIntervalBusy: 10,
    });

    rustClient.analyze.mockResolvedValue({
      level: 'QUIET',
      recommendedSeconds: 5,
      shouldApply: true,
      reason: 'Inactivity Cooldown',
      metrics: {
        messagesIn10s: 0,
        messagesIn60s: 0,
        uniqueUsersIn60s: 0,
      },
    });

    jest.advanceTimersByTime(45_000);
    if (typeof jest.runOnlyPendingTimersAsync === 'function') {
      await jest.runOnlyPendingTimersAsync();
    } else {
      await Promise.resolve();
    }

    expect(client.channels.cache.get).toHaveBeenCalledWith('channel-1');
    expect(rustClient.analyze).toHaveBeenCalledWith(
      'guild-1',
      'channel-1',
      'SYSTEM',
      expect.any(Number),
      10,
      { quietSeconds: 5, normalSeconds: 8, busySeconds: 10 },
    );
    expect(channel.setRateLimitPerUser).toHaveBeenCalledWith(5, 'QUIET - Inactivity Cooldown');
  });

  it('resets active channels to quiet slowmode after inactivity', async () => {
    const channel = makeChannel(10);
    const message = makeMessage(channel);
    const client = makeClient(channel);

    service.setClient(client as any);
    await service.onModuleInit();
    service.updateGuildCache('guild-1', {
      slowmodeEnabled: true,
      slowmodeChannels: ['channel-1'],
      slowmodeIntervalQuiet: 5,
      slowmodeIntervalNormal: 8,
      slowmodeIntervalBusy: 10,
    });

    rustClient.analyze.mockImplementation(async (guildId: string, channelId: string, userId: string) => {
      if (userId === 'SYSTEM') {
        return {
          level: 'QUIET',
          recommendedSeconds: 5,
          shouldApply: true,
          reason: 'Inactivity Cooldown',
          metrics: {
            messagesIn10s: 0,
            messagesIn60s: 0,
            uniqueUsersIn60s: 0,
          },
        };
      }
      return {
        level: 'NORMAL',
        recommendedSeconds: 8,
        shouldApply: false,
        reason: 'Stable message activity',
        metrics: {
          messagesIn10s: 1,
          messagesIn60s: 5,
          uniqueUsersIn60s: 1,
        },
      };
    });

    await service.handleMessage(message);
    jest.advanceTimersByTime(45_000);
    if (typeof jest.runOnlyPendingTimersAsync === 'function') {
      await jest.runOnlyPendingTimersAsync();
    } else {
      await Promise.resolve();
    }

    expect(channel.setRateLimitPerUser).toHaveBeenCalledWith(5, 'QUIET - Inactivity Cooldown');
  });
});
