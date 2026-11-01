import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ApplicationCommandOptionType, Collection } from 'discord.js';
import { CoreCommandService } from './core-command.service';
import { CORE_PLUGIN } from './core-plugin';

describe('/voice', () => {
  const now = new Date('2026-11-01T12:00:00Z');
  let prisma: any;
  let interaction: any;
  let service: CoreCommandService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    prisma = {
      voiceSession: {
        aggregate: jest.fn<any>().mockResolvedValue({ _sum: { duration: 7200 } }),
        findFirst: jest.fn<any>().mockResolvedValue({ joinedAt: new Date('2026-11-01T10:48:00Z') }),
      },
      voiceXpBalance: { findUnique: jest.fn<any>().mockResolvedValue({ xp: 2750n }) },
    };
    interaction = {
      guildId: 'guild', user: { id: 'self', username: 'Othinus' },
      options: { getUser: jest.fn<any>().mockReturnValue(null) },
      guild: { voiceStates: { cache: new Collection([['self', { channelId: 'voice-channel' }]]) } },
      client: { readyTimestamp: new Date('2026-11-01T09:00:00Z').getTime() },
      deferReply: jest.fn<any>().mockResolvedValue(undefined),
      editReply: jest.fn<any>().mockResolvedValue(undefined),
      reply: jest.fn<any>().mockResolvedValue(undefined),
    };
    service = new CoreCommandService({} as any, {} as any, {} as any, prisma);
  });

  afterEach(() => { jest.useRealTimers(); });

  function embed() {
    return interaction.editReply.mock.calls[0][0].embeds[0].toJSON();
  }

  it('registers a guild-only command with an optional user', () => {
    const command = CORE_PLUGIN.commands.find(item => item.name === 'voice');
    expect(command?.data).toMatchObject({
      name: 'voice', dm_permission: false,
      options: [expect.objectContaining({ name: 'user', type: ApplicationCommandOptionType.User, required: false })],
    });
  });

  it('shows duration and level without the XP field or explanatory footer', async () => {
    await service.execute('voice', interaction);
    expect(interaction.deferReply).toHaveBeenCalledWith();
    expect(embed()).toMatchObject({ title: 'Voice Stats — Othinus', fields: [
      { name: 'Total waktu tercatat', value: '3 jam 12 menit', inline: true },
      { name: 'Sesi berjalan (channel ini)', value: '1 jam 12 menit', inline: true },
      { name: 'Level', value: '5', inline: true },
    ] });
    expect(embed().footer).toBeUndefined();
    expect(prisma.voiceSession.aggregate).toHaveBeenCalledWith({ where: { guildId: 'guild', userId: 'self', leftAt: { not: null } }, _sum: { duration: true } });
    expect(prisma.voiceSession.findFirst).toHaveBeenCalledWith({ where: { guildId: 'guild', userId: 'self', channelId: 'voice-channel', leftAt: null }, orderBy: { joinedAt: 'desc' }, select: { joinedAt: true } });
  });

  it('scopes selected-user data to this guild rather than the caller', async () => {
    interaction.options.getUser.mockReturnValue({ id: 'other', username: 'Someone' });
    await service.execute('voice', interaction);
    expect(embed().title).toBe('Voice Stats — Someone');
    expect(prisma.voiceXpBalance.findUnique).toHaveBeenCalledWith({ where: { guildId_userId: { guildId: 'guild', userId: 'other' } } });
    expect(prisma.voiceSession.aggregate.mock.calls[0][0].where.userId).toBe('other');
    expect(prisma.voiceSession.findFirst).not.toHaveBeenCalled();
  });

  it('shows zero history and level zero without inventing an active session', async () => {
    prisma.voiceSession.aggregate.mockResolvedValue({ _sum: { duration: null } });
    prisma.voiceXpBalance.findUnique.mockResolvedValue(null);
    prisma.voiceSession.findFirst.mockResolvedValue(null);
    await service.execute('voice', interaction);
    expect(embed().fields.map((field: any) => field.value)).toEqual(['0 jam 0 menit', 'Belum tercatat', '0']);
  });

  it('does not count stale open rows when the member is not connected', async () => {
    interaction.guild.voiceStates.cache.clear();
    await service.execute('voice', interaction);
    expect(embed().fields[0].value).toBe('2 jam 0 menit');
    expect(embed().fields[1].value).toBe('Tidak sedang di voice');
    expect(prisma.voiceSession.findFirst).not.toHaveBeenCalled();
  });

  it('does not count unobserved time before the current bot connection', async () => {
    interaction.client.readyTimestamp = new Date('2026-11-01T11:30:00Z').getTime();
    await service.execute('voice', interaction);
    expect(embed().fields[0].value).toBe('2 jam 30 menit');
    expect(embed().fields[1].value).toBe('0 jam 30 menit');
  });

  it('clamps future session timestamps instead of showing negative time', async () => {
    prisma.voiceSession.findFirst.mockResolvedValue({ joinedAt: new Date('2026-11-01T13:00:00Z') });
    await service.execute('voice', interaction);
    expect(embed().fields[0].value).toBe('2 jam 0 menit');
    expect(embed().fields[1].value).toBe('0 jam 0 menit');
  });

  it('reports unavailable data without leaking database errors or showing fake zeros', async () => {
    prisma.voiceSession.aggregate.mockRejectedValue(new Error('postgres://secret'));
    await service.execute('voice', interaction);
    expect(interaction.editReply).toHaveBeenCalledWith({ content: 'Statistik voice belum bisa diambil. Coba lagi nanti.' });
  });

  it('does not query voice data outside a guild', async () => {
    interaction.guildId = null;
    await service.execute('voice', interaction);
    expect(prisma.voiceSession.aggregate).not.toHaveBeenCalled();
  });
});
