import { describe, expect, it, jest } from '@jest/globals';
import { MessageFlags } from 'discord.js';
import { AgentCommandService } from './agent-command.service';

function makeInteraction(overrides: Record<string, any> = {}) {
  const interaction: any = {
    id: 'int-1',
    guildId: 'guild-1',
    channelId: 'channel-1',
    guild: { id: 'guild-1', members: { me: {} }, maximumAttachmentSize: 8388608 },
    channel: {
      id: 'channel-1',
      isThread: () => false,
      permissionsFor: () => ({ has: () => true }),
    },
    user: { id: 'user-1' },
    options: {
      getString: jest.fn((name: string) => (name === 'prompt' ? 'halo nio' : null)),
    },
    deferred: false,
    replied: false,
    deferReply: jest.fn(async () => {
      interaction.deferred = true;
    }),
    reply: jest.fn(async () => {
      interaction.replied = true;
    }),
    editReply: jest.fn(async () => ({ id: 'reply-msg-1' })),
    followUp: jest.fn(async () => ({ id: 'followup-msg-1' })),
    fetchReply: jest.fn(async () => ({ id: 'reply-msg-1' })),
    ...overrides,
  };
  return interaction;
}

describe('AgentCommandService', () => {
  it('rejects DM invocations with an ephemeral error before any AI work', async () => {
    const requests = { handle: jest.fn<any>() };
    const service = new AgentCommandService(requests as any);
    const interaction = makeInteraction({ guildId: null, guild: null });

    await service.handle(interaction, 'PUBLIC');

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: MessageFlags.Ephemeral,
      }),
    );
    expect(requests.handle).not.toHaveBeenCalled();
  });

  it('always defers /admin-ai ephemerally and keeps edits/follow-ups ephemeral without saving public message memory', async () => {
    const requests = {
      handle: jest.fn<any>(async () => ({
        profile: 'ADMIN',
        content: 'Ringkasan moderasi internal.',
        conversationTurns: [{ userPrompt: 'halo nio', aiResponse: 'Ringkasan moderasi internal.', timestamp: 1 }],
      })),
    };
    const router = {
      resolve: jest.fn<any>(async () => 'ADMIN'),
    };
    const access = {
      resolve: jest.fn<any>(async () => ({ allowed: true, settings: { enabled: true } })),
    };
    const memory = { saveConversation: jest.fn<any>() };
    const service = new AgentCommandService(requests as any, router as any, access as any, memory as any);
    const interaction = makeInteraction();

    await service.handle(interaction, 'ADMIN');

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(requests.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-1',
        profile: 'ADMIN',
        channelId: 'channel-1',
        userId: 'user-1',
        source: 'SLASH',
      }),
    );
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Ringkasan moderasi internal.',
      }),
    );
    expect(memory.saveConversation).not.toHaveBeenCalled();
  });

  it('replies privately with Ephemeral when /ai is denied by channel routing or access preflight without creating a public placeholder', async () => {
    const requests = { handle: jest.fn<any>() };
    const router = {
      resolve: jest.fn<any>(async () => null),
    };
    const access = {
      resolve: jest.fn<any>(async () => ({ allowed: true })),
    };
    const service = new AgentCommandService(requests as any, router as any, access as any);
    const interaction = makeInteraction();

    await service.handle(interaction, 'PUBLIC');

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: MessageFlags.Ephemeral,
      }),
    );
    expect(requests.handle).not.toHaveBeenCalled();
  });

  it('defers publicly and saves PUBLIC conversation provenance when /ai preflight succeeds', async () => {
    const turns = [{ userPrompt: 'halo nio', aiResponse: 'Halo juga!', timestamp: 10 }];
    const requests = {
      handle: jest.fn<any>(async () => ({
        profile: 'PUBLIC',
        content: 'Halo juga!',
        conversationTurns: turns,
      })),
    };
    const router = {
      resolve: jest.fn<any>(async () => 'PUBLIC'),
    };
    const access = {
      resolve: jest.fn<any>(async () => ({ allowed: true, settings: { enabled: true } })),
    };
    const memory = { saveConversation: jest.fn<any>(async () => undefined) };
    const service = new AgentCommandService(requests as any, router as any, access as any, memory as any);
    const interaction = makeInteraction();

    await service.handle(interaction, 'PUBLIC');

    expect(interaction.deferReply).toHaveBeenCalledWith();
    expect(memory.saveConversation).toHaveBeenCalledWith(
      { guildId: 'guild-1', profile: 'PUBLIC', channelId: 'channel-1', userId: 'user-1' },
      'reply-msg-1',
      turns,
    );
  });
});
