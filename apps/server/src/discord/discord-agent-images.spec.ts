import { describe, expect, it, jest } from '@jest/globals';
import { DiscordBotService } from './discord-bot.service';

describe('Discord image routing', () => {
  it('routes an explicit command before chat admission and never saves image memory', async () => {
    const service: any = Object.create(DiscordBotService.prototype);
    service.client = { user: { id: '123' } };
    service.messageLogs = { prisma: { guildSettings: { findUnique: async () => null } }, logCreate: async () => {} };
    service.buildMessageLogAttachments = async () => [];
    service.agent = { getAccessDecision: jest.fn<any>(async () => ({ allowed: false, reason: 'role-denied' })), handleMention: jest.fn<any>() };
    service.images = { handle: jest.fn<any>(async () => ({ content: 'done', files: [{ attachment: Buffer.from('image'), name: 'nio-generated.png' }] })) };
    service.conversationMemory = { saveConversation: jest.fn<any>() };
    service.logger = { log: jest.fn<any>(), error: jest.fn<any>() };
    const loading = { edit: jest.fn<any>(async () => ({ id: 'delivered' })) };
    const message: any = { id: 'msg', guild: { id: 'guild', members: { me: {} }, maximumAttachmentSize: 10485760 }, channel: { id: 'channel', isThread: () => false, permissionsFor: () => ({ has: () => true }) },
      author: { id: 'user' }, content: '<@123> gambar burung', attachments: new Map(), embeds: [], mentions: { has: () => true }, reply: async () => loading };
    await service.handleAgentMessage(message);
    expect(service.images.handle).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'burung', canAttach: true, messageId: 'msg', attachmentLimit: 8388608 }));
    expect(service.agent.getAccessDecision).not.toHaveBeenCalled();
    expect(service.agent.handleMention).not.toHaveBeenCalled();
    expect(service.conversationMemory.saveConversation).not.toHaveBeenCalled();
    expect(loading.edit).toHaveBeenCalledWith(expect.objectContaining({ files: expect.any(Array) }));
  });
  it('caps attachmentLimit to guild maximumAttachmentSize when smaller than 8 MiB', async () => {
    const service: any = Object.create(DiscordBotService.prototype);
    service.client = { user: { id: '123' } };
    service.messageLogs = { prisma: { guildSettings: { findUnique: async () => null } }, logCreate: async () => {} };
    service.buildMessageLogAttachments = async () => [];
    service.agent = { getAccessDecision: jest.fn<any>(), handleMention: jest.fn<any>() };
    service.images = { handle: jest.fn<any>(async () => ({ content: 'done' })) };
    service.conversationMemory = { saveConversation: jest.fn<any>() };
    service.logger = { log: jest.fn<any>(), error: jest.fn<any>() };
    const loading = { edit: jest.fn<any>(async () => ({ id: 'delivered' })) };
    const message: any = { id: 'msg', guild: { id: 'guild', members: { me: {} }, maximumAttachmentSize: 4194304 }, channel: { id: 'channel', isThread: () => false, permissionsFor: () => ({ has: () => true }) },
      author: { id: 'user' }, content: '<@123> gambar burung', attachments: new Map(), embeds: [], mentions: { has: () => true }, reply: async () => loading };
    await service.handleAgentMessage(message);
    expect(service.images.handle).toHaveBeenCalledWith(expect.objectContaining({ attachmentLimit: 4194304 }));
  });
  it('replies with explicit command instructions for conversational image phrasing without billing chat or images', async () => {
    const service: any = Object.create(DiscordBotService.prototype);
    service.client = { user: { id: '123' } };
    service.messageLogs = { prisma: { guildSettings: { findUnique: async () => null } }, logCreate: async () => {} };
    service.buildMessageLogAttachments = async () => [];
    service.agent = { getAccessDecision: jest.fn<any>(), handleMention: jest.fn<any>() };
    service.images = { handle: jest.fn<any>() };
    service.conversationMemory = { saveConversation: jest.fn<any>() };
    service.logger = { log: jest.fn<any>(), error: jest.fn<any>() };
    const reply = jest.fn<any>(async () => ({}));
    const message: any = { id: 'msg', guild: { id: 'guild', members: { me: {} } }, channel: { id: 'channel', isThread: () => false },
      author: { id: 'user' }, content: '<@123> tolong gambarkan burung biru', attachments: new Map(), embeds: [], mentions: { has: () => true }, reply };
    await service.handleAgentMessage(message);
    expect(service.images.handle).not.toHaveBeenCalled();
    expect(service.agent.handleMention).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('@nio gambar <prompt>') }));
  });
  it('clears pending progress timer when chat returns null or throws', async () => {
    jest.useFakeTimers();
    try {
      const service: any = Object.create(DiscordBotService.prototype);
      service.client = { user: { id: '123' } };
      service.messageLogs = { prisma: { guildSettings: { findUnique: async () => null } }, logCreate: async () => {} };
      service.buildMessageLogAttachments = async () => [];
      service.agent = {
        getAccessDecision: jest.fn<any>(async () => ({ allowed: true })),
        handleMention: jest.fn<any>(async (_g: string, _c: string, _u: string, _m: string, _r: any, _ctx: any, onProgress: (s: string) => Promise<void>) => {
          await onProgress('Step 1');
          await onProgress('Step 2');
          return null;
        }),
      };
      service.conversationMemory = { saveConversation: jest.fn<any>() };
      service.logger = { log: jest.fn<any>(), error: jest.fn<any>() };
      const loading = { edit: jest.fn<any>(async () => ({})), delete: jest.fn<any>(async () => ({})) };
      const message: any = { id: 'msg', guild: { id: 'guild' }, channel: { id: 'channel' }, author: { id: 'user' }, content: '<@123> halo', attachments: new Map(), embeds: [], mentions: { has: () => true }, reply: async () => loading };
      await service.handleAgentMessage(message);
      expect(loading.delete).toHaveBeenCalledTimes(1);
      const editsBefore = loading.edit.mock.calls.length;
      jest.advanceTimersByTime(5000);
      expect(loading.edit).toHaveBeenCalledTimes(editsBefore);
    } finally {
      jest.useRealTimers();
    }
  });
});
