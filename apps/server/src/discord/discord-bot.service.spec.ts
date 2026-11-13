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

  it('saves the delivered snapshot under every multipart ID using the admitted scope', async () => {
    const { service } = makeService();
    (service.client as any).user = { id: 'bot-1' };
    const content = 'paragraph '.repeat(500);
    (service as any).agent = {
      getAccessDecision: async () => ({ allowed: true, settings: { activityVisibility: 'HIDDEN' } }),
      handleMention: async () => ({ profile: 'ADMIN', content, conversationTurns: [{ userPrompt: 'hi', aiResponse: content, timestamp: 1 }] }),
    };
    const save = jest.fn<any>(async () => {});
    (service as any).conversationMemory = { saveConversation: save };
    let count = 0;
    const message: any = {
      id: 'msg', guild: { id: 'guild-1' }, channel: { id: 'channel-1' }, author: { id: 'user-1' },
      content: '<@bot-1> hi', createdAt: new Date(), attachments: new Map(), embeds: [], mentions: { has: () => true }, reference: null,
      reply: async () => ({ id: `part-${++count}` }),
    };
    await (service as any).handleAgentMessage(message);
    expect(count).toBeGreaterThan(1);
    expect(save).toHaveBeenCalledTimes(count);
    expect(save.mock.calls.every((call: any[]) => call[0].profile === 'PUBLIC' && call[2][0].aiResponse === content)).toBe(true);
  });

  it('hides placeholders and progress but still delivers the final answer', async () => {
    const { service } = makeService();
    (service.client as any).user = { id: 'bot-1' };
    const payloads: any[] = [];
    (service as any).agent = {
      getAccessDecision: async () => ({ allowed: true, settings: { activityVisibility: 'HIDDEN' } }),
      handleMention: async (...args: any[]) => { await args[6]('Menyusun jawaban…'); return { content: 'Selesai.' }; },
    };
    const message: any = {
      id: 'msg', guild: { id: 'guild-1' }, channel: { id: 'channel-1' }, author: { id: 'user-1' },
      content: '<@bot-1> halo', createdAt: new Date(), attachments: new Map(), embeds: [], mentions: { has: () => true }, reference: null,
      reply: async (payload: any) => { payloads.push(payload); return { id: 'answer', edit: async (payload: any) => { payloads.push(payload); return { id: 'answer' }; } }; },
    };
    await (service as any).handleAgentMessage(message);
    expect(payloads.map((payload) => payload.content)).toEqual(['Selesai.']);
  });

  it('keeps one concise activity message and ignores raw drafts and unknown progress', async () => {
    jest.useFakeTimers();
    const { service } = makeService();
    (service.client as any).user = { id: 'bot-1' };
    const payloads: any[] = [];
    const loading = { id: 'reply-1', edit: async (p: any) => { payloads.push(p); return { id: 'reply-1' }; } };
    (service as any).agent = {
      getAccessDecision: async () => ({ allowed: true }),
      handleMention: async (...args: any[]) => {
        await args[6]('[draft] private reasoning');
        await args[6]('get_user_warnings secret raw output');
        await args[6]('Mencari sumber terbaru…');
        await jest.advanceTimersByTimeAsync(1200);
        await args[6]('Menyusun jawaban…');
        await jest.advanceTimersByTimeAsync(1200);
        return { content: 'Jawaban akhir.' };
      },
    };
    const message: any = {
      id: 'msg', guild: { id: 'guild-1' }, channel: { id: 'channel-1', sendTyping: async () => {} },
      author: { id: 'user-1' }, content: '<@bot-1> cari berita', createdAt: new Date(),
      attachments: new Map(), embeds: [], mentions: { has: () => true }, reference: null,
      reply: async (p: any) => { payloads.push(p); return loading; },
    };
    try {
      await (service as any).handleAgentMessage(message);
      const contents = payloads.map((p) => p.content);
      expect(contents.join(' ')).not.toMatch(/private reasoning|get_user_warnings|Thinking|```|\[draft\]/);
      expect(contents).toContain('*Mencari sumber terbaru…*');
      expect(contents).toContain('*Menyusun jawaban…*');
      expect(contents.at(-1)).toBe('Jawaban akhir.');
      expect(payloads.every((p) => p.allowedMentions.parse.length === 0)).toBe(true);
    } finally { jest.useRealTimers(); }
  });

  it('waits for an in-flight status edit before delivering the final answer', async () => {
    jest.useFakeTimers();
    const { service } = makeService();
    (service.client as any).user = { id: 'bot-1' };
    const contents: string[] = [];
    const loading = { id: 'reply', edit: async (p: any) => {
      if (p.content === '*Menyusun jawaban…*') await new Promise((r) => setTimeout(r, 3000));
      contents.push(p.content);
      return { id: 'reply' };
    } };
    (service as any).agent = {
      getAccessDecision: async () => ({ allowed: true }),
      handleMention: async (...args: any[]) => {
        await args[6]('Mencari sumber terbaru…');
        await args[6]('Menyusun jawaban…');
        await jest.advanceTimersByTimeAsync(1300);
        return { content: 'Jawaban akhir.' };
      },
    };
    const message: any = {
      id: 'msg', guild: { id: 'guild' }, channel: { id: 'channel', sendTyping: async () => {} },
      author: { id: 'user' }, content: '<@bot-1> search', createdAt: new Date(),
      attachments: new Map(), embeds: [], mentions: { has: () => true }, reference: null,
      reply: async () => loading,
    };
    try {
      const pending = (service as any).handleAgentMessage(message);
      await jest.advanceTimersByTimeAsync(5000);
      await pending;
      expect(contents.at(-1)).toBe('Jawaban akhir.');
    } finally { jest.useRealTimers(); }
  });

  it('delivers structured AI responses as embeds when channel permits EmbedLinks', async () => {
    const { service } = makeService();
    (service.client as any).user = { id: 'bot-1' };
    const structured = `Berikut adalah rangkuman dari artikel-artikel Tempo:
---
1. Jalur Cepat Memakzulkan Gibran Rakabuming Raka
- Tautan: https://tempo.co/read/12345
- Inti Pembahasan: Mengulas strategi anggota DPR dalam menindaklanjuti wacana pemakzulan.
---
2. Proses Pemakzulan di DPR Tetap Berjalan
- Tautan: https://tempo.co/read/67890
- Inti Pembahasan: Fraksi-fraksi di DPR mulai memetakan suara.`;

    let finalPayload: any = null;
    const loading = {
      id: 'loading-1',
      edit: async (p: any) => {
        finalPayload = p;
        return { id: 'loading-1' };
      },
    };
    (service as any).agent = {
      getAccessDecision: async () => ({ allowed: true }),
      handleMention: async () => ({ content: structured, profile: 'PUBLIC' }),
    };
    const permissionsFor = jest.fn(() => ({
      has: (perm: string) => perm === 'EmbedLinks' || perm === 'SendMessages',
    }));
    const message: any = {
      id: 'msg-embed',
      guild: { id: 'guild-1', members: { me: {} } },
      channel: {
        id: 'channel-1',
        isThread: () => false,
        permissionsFor,
        sendTyping: async () => {},
      },
      author: { id: 'user-1' },
      content: '<@bot-1> rangkum tempo',
      createdAt: new Date(),
      attachments: new Map(),
      embeds: [],
      mentions: { has: () => true },
      reference: null,
      reply: async () => loading,
    };

    await (service as any).handleAgentMessage(message);
    expect(finalPayload).not.toBeNull();
    expect(finalPayload.embeds).toBeDefined();
    expect(finalPayload.embeds[0].title).toBe('NIO Intelligence');
    expect(finalPayload.content).toBe('');
  });

  it('falls back to plain text when channel does not permit EmbedLinks', async () => {
    const { service } = makeService();
    (service.client as any).user = { id: 'bot-1' };
    const structured = `Berikut adalah rangkuman dari artikel-artikel Tempo:
---
1. Jalur Cepat Memakzulkan Gibran Rakabuming Raka
- Tautan: https://tempo.co/read/12345
- Inti Pembahasan: Mengulas strategi anggota DPR dalam menindaklanjuti wacana pemakzulan.
---
2. Proses Pemakzulan di DPR Tetap Berjalan
- Tautan: https://tempo.co/read/67890
- Inti Pembahasan: Fraksi-fraksi di DPR mulai memetakan suara.`;

    let finalPayload: any = null;
    const loading = {
      id: 'loading-1',
      edit: async (p: any) => {
        finalPayload = p;
        return { id: 'loading-1' };
      },
    };
    (service as any).agent = {
      getAccessDecision: async () => ({ allowed: true }),
      handleMention: async () => ({ content: structured, profile: 'PUBLIC' }),
    };
    // No EmbedLinks permission
    const permissionsFor = jest.fn(() => ({
      has: (perm: string) => perm === 'SendMessages',
    }));
    const message: any = {
      id: 'msg-no-embed',
      guild: { id: 'guild-1', members: { me: {} } },
      channel: {
        id: 'channel-1',
        isThread: () => false,
        permissionsFor,
        sendTyping: async () => {},
      },
      author: { id: 'user-1' },
      content: '<@bot-1> rangkum tempo',
      createdAt: new Date(),
      attachments: new Map(),
      embeds: [],
      mentions: { has: () => true },
      reference: null,
      reply: async () => loading,
    };

    await (service as any).handleAgentMessage(message);
    expect(finalPayload).not.toBeNull();
    expect(finalPayload.embeds).toBeUndefined();
    expect(finalPayload.content).toContain('Berikut adalah rangkuman');
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
