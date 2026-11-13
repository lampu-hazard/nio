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
  it.each(['PUBLIC', 'ADMIN'] as const)('delivers multipart %s answers with scoped privacy and memory', async (profile) => {
    const content = 'paragraph '.repeat(500);
    const requests = { handle: async () => ({ content, conversationTurns: [{ userPrompt: 'hi', aiResponse: content, timestamp: 1 }] }) };
    const memory = { saveConversation: jest.fn<any>(async () => {}) };
    const interaction = makeInteraction();
    await new AgentCommandService(requests as any, undefined, undefined, memory as any).handle(interaction, profile);
    expect(interaction.followUp.mock.calls.length).toBeGreaterThan(0);
    for (const [payload] of [...interaction.editReply.mock.calls, ...interaction.followUp.mock.calls]) {
      expect(payload.content.length).toBeLessThanOrEqual(2000);
      expect(payload.allowedMentions).toEqual({ parse: [], users: [], roles: [], repliedUser: false });
    }
    if (profile === 'ADMIN') {
      expect(interaction.followUp.mock.calls.every(([p]: any[]) => p.flags === MessageFlags.Ephemeral)).toBe(true);
      expect(memory.saveConversation).not.toHaveBeenCalled();
    } else {
      expect(memory.saveConversation.mock.calls.length).toBe(1 + interaction.followUp.mock.calls.length);
      expect(memory.saveConversation.mock.calls.every((call: any[]) => call[2][0].aiResponse === content)).toBe(true);
    }
  });
  it('persists only sent PUBLIC content on a failed continuation and recovers first ID without replay', async () => {
    const content = 'paragraph '.repeat(600);
    const interaction = makeInteraction({ editReply: jest.fn<any>(async () => ({})), followUp: jest.fn<any>(async () => { throw Error('offline'); }) });
    const memory = { saveConversation: jest.fn<any>(async () => {}) };
    const requests = { handle: async () => ({ content, conversationTurns: [{ userPrompt: 'hi', aiResponse: content, timestamp: 1 }] }) };
    await new AgentCommandService(requests as any, undefined, undefined, memory as any).handle(interaction, 'PUBLIC');
    expect(interaction.fetchReply).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).toHaveBeenCalledTimes(1);
    expect(memory.saveConversation).toHaveBeenCalledTimes(1);
    expect((memory.saveConversation.mock.calls[0][2] as any)[0].aiResponse.length).toBeLessThan(content.length);
  });
  it('edits an ephemeral continuation through the interaction webhook after a later failure', async () => {
    const content = 'paragraph '.repeat(700);
    let follows = 0;
    const editMessage = jest.fn<any>(async () => ({}));
    const interaction = makeInteraction({ webhook: { editMessage }, followUp: jest.fn<any>(async () => { if (++follows === 2) throw Error('offline'); return { id: 'private-part' }; }) });
    const requests = { handle: async () => ({ content }) };
    await new AgentCommandService(requests as any).handle(interaction, 'ADMIN');
    expect(editMessage).toHaveBeenCalledWith('private-part', expect.objectContaining({ content: expect.stringContaining('Pengiriman jawaban terhenti.') }));
    expect(interaction.followUp).toHaveBeenCalledTimes(2);
  });
  it.each([true, false])('uses full-answer attachment only with permission=%s', async (allowed) => {
    const content = 'long '.repeat(4000);
    const interaction = makeInteraction({ channel: { isThread: () => false, permissionsFor: () => ({ has: () => allowed }) } });
    const requests = { handle: async () => ({ content }) };
    await new AgentCommandService(requests as any).handle(interaction, 'PUBLIC');
    const first = interaction.editReply.mock.calls[0][0];
    if (allowed) {
      expect(first.files[0].name).toBe('nio-answer.txt');
      expect(first.files[0].attachment.toString()).toBe(content);
      expect(interaction.followUp).not.toHaveBeenCalled();
    } else {
      expect(first.files).toBeUndefined();
      const payloads = [first, ...interaction.followUp.mock.calls.map(([p]: any[]) => p)];
      expect(payloads.length).toBeLessThanOrEqual(5);
      expect(payloads.at(-1).content).toContain('Jawaban belum terkirim seluruhnya');
    }
  });
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

  it('delivers structured responses as embeds when EmbedLinks permission is present', async () => {
    const structured = `Berikut adalah rangkuman dari artikel-artikel Tempo:
---
1. Jalur Cepat Memakzulkan Gibran Rakabuming Raka
- Tautan: https://tempo.co/read/12345
- Inti Pembahasan: Mengulas strategi anggota DPR dalam menindaklanjuti wacana pemakzulan.
---
2. Proses Pemakzulan di DPR Tetap Berjalan
- Tautan: https://tempo.co/read/67890
- Inti Pembahasan: Fraksi-fraksi di DPR mulai memetakan suara.`;

    const interaction = makeInteraction();
    const requests = { handle: async () => ({ content: structured }) };
    await new AgentCommandService(requests as any).handle(interaction, 'PUBLIC');

    const first = interaction.editReply.mock.calls[0][0];
    expect(first.embeds).toBeDefined();
    expect(first.embeds[0].title).toBe('NIO Intelligence');
    expect(first.content).toBe('');
  });
});
