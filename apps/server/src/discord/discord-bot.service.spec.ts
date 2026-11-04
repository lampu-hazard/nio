import { describe, expect, it, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Events } from 'discord.js';
import { DiscordBotService } from './discord-bot.service';

const makeService = (overrides: any = {}) => {
  const messageLogs = overrides.messageLogs || {
    prisma: {
      guildSettings: { findUnique: jest.fn(async () => ({ messageDeleteLogChannelId: null })) },
      discordMessageLog: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    },
    logCreate: jest.fn<any>(async () => ({})),
    logDelete: jest.fn<any>(async () => ({})),
  };

  return {
    service: new DiscordBotService(
      { handle: jest.fn() } as any,
      { getCachedUrl: jest.fn() } as any,
      { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
      { setClient: jest.fn(), handleMessage: jest.fn() } as any,
      { handleMessage: jest.fn() } as any,
      { setClient: jest.fn(), handleBoosterStatusChange: jest.fn() } as any,
      { setClient: jest.fn() } as any,
      { canHandle: jest.fn(async () => ({ allowed: false })) } as any,
      { setClient: jest.fn() } as any,
      messageLogs as any,
      { setClient: jest.fn(), setSlowmodeService: jest.fn(), setAnomalyService: jest.fn(), setVoiceConnectionService: jest.fn() } as any,
      { setClient: jest.fn() } as any,
      { saveConversation: jest.fn() } as any,
      { } as any,
      { sync: jest.fn(), reconcileUnavailablePlugins: jest.fn(async () => {}) } as any,
      { dispatchMessage: jest.fn() } as any,
      { setClient: jest.fn(), handleReaction: jest.fn(), handleMessageDelete: jest.fn() } as any,
      undefined,
      overrides.voiceActivity,
    ),
    messageLogs,
  };
};

describe('DiscordBotService deleted message logs', () => {
  it('stops voice accounting on transient shard reconnect', async () => {
    const voiceActivity = { setClient: jest.fn(), disconnect: jest.fn(async (_id: number) => {}), start: jest.fn(async () => {}) };
    const { service } = makeService({ voiceActivity });
    const oldToken = process.env.DISCORD_BOT_TOKEN; const oldId = process.env.DISCORD_CLIENT_ID;
    process.env.DISCORD_BOT_TOKEN = 'test'; process.env.DISCORD_CLIENT_ID = 'test';
    jest.spyOn(service.client, 'login').mockResolvedValue('test');
    jest.spyOn(service as any, 'cleanupDeletedMedia').mockResolvedValue(undefined);
    try {
      await service.onModuleInit();
      service.client.emit(Events.ShardReconnecting, 0);
      await Promise.resolve();
      expect(voiceActivity.disconnect).toHaveBeenCalledWith(0);
    } finally {
      service.onModuleDestroy();
      if (oldToken === undefined) delete process.env.DISCORD_BOT_TOKEN; else process.env.DISCORD_BOT_TOKEN = oldToken;
      if (oldId === undefined) delete process.env.DISCORD_CLIENT_ID; else process.env.DISCORD_CLIENT_ID = oldId;
    }
  });

  it('logs message creates to Prisma', async () => {
    const { service, messageLogs } = makeService();
    const message = {
      id: 'msg-1',
      guild: { id: 'guild-1' },
      channel: { id: 'channel-1' },
      author: { id: 'user-1' },
      content: 'hello',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      createdTimestamp: Date.parse('2026-01-01T00:00:00Z'),
      attachments: new Map(),
      embeds: [],
      reference: null,
    };

    await (service as any).handleAgentMessage(message);

    expect(messageLogs.logCreate).toHaveBeenCalledWith(expect.objectContaining({
      id: 'msg-1',
      content: 'hello',
      attachments: [],
    }));
  });

  it('clears the media cleanup interval on shutdown', () => {
    const { service } = makeService();
    (service as any).mediaCleanupInterval = setInterval(() => undefined, 1000);

    service.onModuleDestroy();

    expect((service as any).mediaCleanupInterval).toBeNull();
  });

  it('sends cached media files to the Discord delete log channel', async () => {
    const deletedBytes = Buffer.from('deleted image');
    const cachedFileName = path.join('guild-1', 'msg-1', 'att-1-photo.png');
    const send = jest.fn<any>(async () => ({}));
    const cachePath = path.resolve(process.cwd(), '.tmp/delete-log-media', cachedFileName);
    await fs.rm(path.dirname(path.dirname(cachePath)), { recursive: true, force: true });
    const messageLogs = {
      prisma: {
        guildSettings: { findUnique: jest.fn(async () => ({ messageDeleteLogChannelId: 'log-channel-1' })) },
        discordMessageLog: {
          findUnique: jest.fn(async () => ({
            id: 'msg-1',
            authorId: 'user-1',
            channelId: 'channel-1',
            content: '',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            guildId: 'guild-1',
            attachments: [{ name: 'photo.png', cachedFileName }],
          })),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
      },
      logCreate: jest.fn<any>(async () => ({})),
      logDelete: jest.fn<any>(async () => ({})),
    };
    const { service } = makeService({ messageLogs });
    await (service as any).writeDeleteLogMedia(cachedFileName, deletedBytes);

    await (service as any).handleMessageDelete({
      id: 'msg-1',
      guild: {
        id: 'guild-1',
        channels: { fetch: jest.fn(async () => ({ isTextBased: () => true, send })) },
      },
    });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      files: [{ attachment: deletedBytes, name: 'photo.png' }],
    }));
    await expect(fs.readFile(cachePath)).rejects.toThrow();
  });

  it('ignores unrouted channels and cross-profile bot replies when profileRouter is configured', async () => {
    const { service } = makeService();
    (service.client as any).user = { id: 'bot-1' };
    const profileRouter = {
      resolve: jest.fn<any>(async () => null),
      setClient: jest.fn(),
    };
    (service as any).profileRouter = profileRouter;
    const handleMention = jest.fn<any>();
    (service as any).agent = {
      getAccessDecision: jest.fn<any>(),
      handleMention,
    };

    const unroutedMsg: any = {
      id: 'msg-unrouted',
      guild: { id: 'guild-1' },
      channel: { id: 'channel-1', isThread: () => false },
      author: { id: 'user-1' },
      content: '<@bot-1> halo',
      createdAt: new Date(),
      attachments: new Map(),
      embeds: [],
      mentions: { has: () => true },
      reference: null,
      reply: jest.fn(),
    };

    await (service as any).handleAgentMessage(unroutedMsg);
    expect(handleMention).not.toHaveBeenCalled();

    // Now test reply to a bot message whose provenance belongs to ADMIN while channel is PUBLIC
    profileRouter.resolve.mockResolvedValueOnce('PUBLIC');
    (service as any).conversationMemory = {
      getProvenance: jest.fn<any>(async () => ({
        guildId: 'guild-1',
        profile: 'ADMIN',
        channelId: 'channel-admin',
        userId: 'user-1',
      })),
      saveConversation: jest.fn<any>(),
    };

    const replyOnlyMsg: any = {
      id: 'msg-reply-cross',
      guild: { id: 'guild-1' },
      channel: {
        id: 'channel-public',
        isThread: () => false,
        messages: {
          fetch: jest.fn(async () => ({
            id: 'bot-msg-admin',
            author: { id: 'bot-1' },
            channel: { id: 'channel-public' },
            content: 'admin response',
            createdAt: new Date(),
            attachments: new Map(),
          })),
        },
      },
      author: { id: 'user-1' },
      content: 'lanjutkan',
      createdAt: new Date(),
      attachments: new Map(),
      embeds: [],
      mentions: { has: () => false },
      reference: { messageId: 'bot-msg-admin' },
      reply: jest.fn(),
    };

    await (service as any).handleAgentMessage(replyOnlyMsg);
    expect(handleMention).not.toHaveBeenCalled();
  });
});
