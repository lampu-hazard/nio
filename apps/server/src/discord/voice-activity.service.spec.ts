import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import { ChannelType, Collection, PermissionsBitField } from 'discord.js';
import { VoiceActivityService, accrueVoiceXp, voiceLevel } from './voice-activity.service';
import * as levelCard from './voice-level-card';

function fixture() {
  const balances = new Map<string, any>();
  const settings: any = { voiceXpEnabled: true, voiceXpPerMinute: 10, voiceNotificationChannelId: null };
  const rewards: any[] = [];
  const prisma: any = {
    guildSettings: { findUnique: jest.fn(async () => ({ ...settings })) },
    voiceXpReward: { findMany: jest.fn(async () => [...rewards]) },
    voiceXpBalance: {
      findUnique: jest.fn(async ({ where }: any) => balances.get(where.guildId_userId.userId) || null),
      upsert: jest.fn(async ({ create, update }: any) => {
        const value = { ...(balances.get(create.userId) ? update : create) };
        balances.set(create.userId, value);
        return value;
      }),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const logger: any = { error: jest.fn(), warn: jest.fn() };
  const guild: any = {
    id: 'guild', shardId: 0, afkChannelId: 'afk',
    voiceStates: { cache: new Collection() },
    members: { me: { permissions: new PermissionsBitField(PermissionsBitField.All), roles: { highest: { id: 'highest' } } } },
    roles: { cache: new Collection(), fetch: jest.fn(async (id: string) => guild.roles.cache.get(id)) },
    channels: { cache: new Collection(), fetch: jest.fn(async (id: string) => guild.channels.cache.get(id)) },
  };
  for (const id of ['general', 'lounge', 'afk', 'stage']) {
    guild.channels.cache.set(id, { id, guild, name: id === 'general' ? 'General' : id === 'lounge' ? 'Lounge' : id, type: id === 'stage' ? ChannelType.GuildStageVoice : ChannelType.GuildVoice });
  }
  const send = jest.fn(async (_payload: any) => ({}));
  guild.channels.cache.set('logs', { id: 'logs', guild, name: 'logs', type: ChannelType.GuildText, permissionsFor: () => guild.members.me.permissions, send });
  const client: any = { guilds: { cache: new Collection([['guild', guild]]) } };
  const service = new VoiceActivityService(prisma, logger);
  service.setClient(client);
  function state(id: string, channelId: string | null, extra: any = {}) {
    const member: any = { id, guild, displayName: id === 'a' ? 'Othinus' : id, user: { bot: false }, roles: { cache: new Collection(), add: jest.fn(async (role: any) => member.roles.cache.set(typeof role === 'string' ? role : role.id, role)) } };
    return { id, guild, channelId, channel: channelId ? guild.channels.cache.get(channelId) : null, member, selfMute: false, serverMute: false, selfDeaf: false, serverDeaf: false, ...extra } as any;
  }
  async function change(old: any, next: any) {
    if (next.channelId) guild.voiceStates.cache.set(next.id, next);
    else guild.voiceStates.cache.delete(next.id);
    await service.handleVoiceStateUpdate(old, next);
  }
  const addRole = (id: string, level: number) => {
    const role: any = { id, guild, managed: false, comparePositionTo: () => -1 };
    guild.roles.cache.set(id, role);
    rewards.push({ level, roleId: id });
    return role;
  };
  return { service, prisma, settings, balances, rewards, guild, state, change, send, addRole, logger };
}

describe('voice XP arithmetic', () => {
  it.each([[0n, 0], [99n, 0], [100n, 1], [399n, 1], [400n, 2], [1000000000000000000n, 100000000]])('derives level for %s XP', (xp, level) => {
    expect(voiceLevel(xp)).toBe(level);
  });
  it('preserves fractional progress across short settlements', () => {
    expect(accrueVoiceXp(99n, 59990, 1, 10)).toEqual({ xp: 100n, remainder: 0 });
    let result = { xp: 0n, remainder: 0 };
    for (let i = 0; i < 10; i++) result = accrueVoiceXp(result.xp, result.remainder, 6000, 10);
    expect(result).toEqual({ xp: 10n, remainder: 0 });
  });
});

describe('voice activity', () => {
  beforeEach(() => {
    jest.useFakeTimers(); jest.setSystemTime(0);
    jest.spyOn(levelCard, 'renderVoiceLevelCard').mockRejectedValue(new Error('Renderer unavailable'));
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('awards two eligible humans while still connected', async () => {
    const f = fixture();
    f.guild.voiceStates.cache.set('a', f.state('a', 'general'));
    f.guild.voiceStates.cache.set('b', f.state('b', 'general'));
    await f.service.start();
    jest.setSystemTime(60000);
    await f.service.flush();
    expect(f.balances.get('a').xp).toBe(10n);
    expect(f.balances.get('b').xp).toBe(10n);
    await f.service.onModuleDestroy();
  });

  it.each([
    ['alone', null, {}], ['bot', 'general', { member: { user: { bot: true }, id: 'b' } }],
    ['self mute', 'general', { selfMute: true }], ['server mute', 'general', { serverMute: true }],
    ['self deaf', 'general', { selfDeaf: true }], ['server deaf', 'general', { serverDeaf: true }],
    ['AFK', 'afk', {}], ['stage', 'stage', {}],
  ])('excludes %s from the eligible pair', async (_name, channel, extra) => {
    const f = fixture();
    f.guild.voiceStates.cache.set('a', f.state('a', channel === 'afk' || channel === 'stage' ? channel : 'general'));
    if (channel) f.guild.voiceStates.cache.set('b', f.state('b', channel as string, extra));
    await f.service.start();
    jest.setSystemTime(60000);
    await f.service.flush();
    expect([...f.balances.values()].every((b) => b.xp === 0n)).toBe(true);
    await f.service.onModuleDestroy();
  });

  it.each(['mute', 'leave', 'move'])('settles both members at a %s transition', async (kind) => {
    const f = fixture();
    const a = f.state('a', 'general');
    const b = f.state('b', 'general');
    f.guild.voiceStates.cache.set('a', a); f.guild.voiceStates.cache.set('b', b);
    await f.service.start();
    jest.setSystemTime(30000);
    await f.change(b, f.state('b', kind === 'leave' ? null : kind === 'move' ? 'lounge' : 'general', { selfMute: kind === 'mute' }));
    jest.setSystemTime(60000);
    await f.service.flush();
    expect(f.balances.get('a').xp).toBe(5n);
    expect(f.balances.get('b').xp).toBe(5n);
    await f.service.onModuleDestroy();
  });

  it('does not double-credit overlapping flushes', async () => {
    const f = fixture();
    f.guild.voiceStates.cache.set('a', f.state('a', 'general')); f.guild.voiceStates.cache.set('b', f.state('b', 'general'));
    await f.service.start(); jest.setSystemTime(60000);
    await Promise.all([f.service.flush(), f.service.flush()]);
    expect(f.balances.get('a').xp).toBe(10n);
    await f.service.onModuleDestroy();
  });

  it('retains failed closed intervals without crediting later ineligible time', async () => {
    const f = fixture(); const b = f.state('b', 'general');
    f.guild.voiceStates.cache.set('a', f.state('a', 'general')); f.guild.voiceStates.cache.set('b', b);
    await f.service.start(); jest.setSystemTime(30000);
    f.prisma.voiceXpBalance.upsert.mockRejectedValueOnce(new Error('database unavailable'));
    await f.change(b, f.state('b', null));
    jest.setSystemTime(120000); await f.service.flush();
    expect(f.balances.get('a').xp).toBe(5n);
    expect(f.balances.get('b').xp).toBe(5n);
    await f.service.onModuleDestroy();
  });

  it('settles old rates and preserves balances while disabled', async () => {
    const f = fixture();
    f.guild.voiceStates.cache.set('a', f.state('a', 'general')); f.guild.voiceStates.cache.set('b', f.state('b', 'general'));
    await f.service.start(); jest.setSystemTime(30000);
    await f.service.withGuildSettingsUpdate('guild', async () => { f.settings.voiceXpPerMinute = 20; });
    jest.setSystemTime(60000);
    await f.service.withGuildSettingsUpdate('guild', async () => { f.settings.voiceXpEnabled = false; });
    jest.setSystemTime(120000); await f.service.flush();
    expect(f.balances.get('a').xp).toBe(15n);
    await f.service.onModuleDestroy();
  });

  it('does not award offline time after reconnect', async () => {
    const f = fixture();
    f.guild.voiceStates.cache.set('a', f.state('a', 'general')); f.guild.voiceStates.cache.set('b', f.state('b', 'general'));
    await f.service.start(); jest.setSystemTime(30000); await f.service.disconnect();
    jest.setSystemTime(90000); await f.service.start();
    jest.setSystemTime(120000); await f.service.flush();
    expect(f.balances.get('a').xp).toBe(10n);
    await f.service.onModuleDestroy();
  });

  it('assigns cumulative rewards and retries a failed role without duplicating XP', async () => {
    const f = fixture(); const a = f.state('a', 'general');
    f.addRole('five', 5); f.addRole('ten', 10);
    f.balances.set('a', { guildId: 'guild', userId: 'a', xp: 9990n, remainder: 0 });
    a.member.roles.add.mockRejectedValueOnce(new Error('Discord unavailable'));
    f.guild.voiceStates.cache.set('a', a); f.guild.voiceStates.cache.set('b', f.state('b', 'general'));
    await f.service.start(); jest.setSystemTime(60000); await f.service.flush();
    await f.service.flush();
    expect(a.member.roles.cache.has('five')).toBe(true);
    expect(a.member.roles.cache.has('ten')).toBe(true);
    expect(f.balances.get('a').xp).toBe(10000n);
    expect(f.balances.get('b').xp).toBe(10n);
    await f.service.onModuleDestroy();
  });

  it.each(['flush', 'leave', 'disconnect'])('announces a committed level increase during %s without a reward mapping', async (kind) => {
    const f = fixture(); f.settings.voiceLevelUpChannelId = 'logs';
    f.balances.set('a', { xp: 95n, remainder: 0 });
    const a = f.state('a', 'general');
    f.guild.voiceStates.cache.set('a', a); f.guild.voiceStates.cache.set('b', f.state('b', 'general'));
    await f.service.start(); jest.setSystemTime(30000);
    if (kind === 'leave') await f.change(a, f.state('a', null));
    else if (kind === 'disconnect') await f.service.disconnect();
    else await f.service.flush();
    await f.service.flush();
    expect(f.send.mock.calls.map(([payload]) => payload)).toEqual([{
      embeds: [{ title: 'Level Up', description: 'Othinus reached level 1' }],
      allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
    }]);
    expect(f.balances.get('a').xp).toBe(100n);
    await f.service.onModuleDestroy();
  });

  it('uses a separate channel and announces only the latest crossed level', async () => {
    const f = fixture(); f.settings.voiceNotificationChannelId = 'logs'; f.settings.voiceLevelUpChannelId = 'levels';
    const levelSend = jest.fn(async (_payload: any) => ({}));
    f.guild.channels.cache.set('levels', { ...f.guild.channels.cache.get('logs'), id: 'levels', send: levelSend });
    f.settings.voiceXpPerMinute = 1000;
    f.guild.voiceStates.cache.set('a', f.state('a', 'general')); await f.service.start();
    await f.change(f.state('b', null), f.state('b', 'general'));
    jest.setSystemTime(60000); await f.service.flush();
    expect(f.send.mock.calls.map(([p]) => p.embeds[0].title)).toEqual(['Voice Join']);
    expect(levelSend.mock.calls.map(([p]) => p.embeds)).toEqual([
      [{ title: 'Level Up', description: 'Othinus reached level 3' }],
      [{ title: 'Level Up', description: 'b reached level 3' }],
    ]);
    await f.service.onModuleDestroy();
  });

  it('attaches the level card using the committed previous level and balance', async () => {
    const png = Buffer.from('test-png');
    jest.mocked(levelCard.renderVoiceLevelCard).mockResolvedValue(png);
    const f = fixture(); f.settings.voiceLevelUpChannelId = 'logs';
    f.balances.set('a', { xp: 395n, remainder: 0 });
    const a = f.state('a', 'general');
    a.member.displayAvatarURL = () => 'https://cdn.discordapp.com/avatars/123/hash.png?size=128';
    f.guild.voiceStates.cache.set('a', a); f.guild.voiceStates.cache.set('b', f.state('b', 'general'));
    await f.service.start(); jest.setSystemTime(30000); await f.service.flush(); await f.service.flush();
    expect(levelCard.renderVoiceLevelCard).toHaveBeenCalledWith({ name: 'Othinus', previousLevel: 1, level: 2, xp: 400n, avatarUrl: 'https://cdn.discordapp.com/avatars/123/hash.png?size=128' });
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.send.mock.calls[0][0]).toMatchObject({
      embeds: [{ description: 'Othinus reached level 2', image: { url: 'attachment://voice-level-up.png' } }],
      files: [{ attachment: png, name: 'voice-level-up.png', description: 'Othinus: level 1 → 2. Total XP 400. Next level 3: 900 XP.' }],
    });
    expect(f.balances.get('a').xp).toBe(400n);
    await f.service.onModuleDestroy();
  });

  it('falls back to the plain embed if the card attachment cannot be delivered', async () => {
    jest.mocked(levelCard.renderVoiceLevelCard).mockResolvedValue(Buffer.from('test-png'));
    const f = fixture(); f.settings.voiceLevelUpChannelId = 'logs'; f.addRole('one', 1);
    f.balances.set('a', { xp: 95n, remainder: 0 }); const a = f.state('a', 'general');
    f.guild.voiceStates.cache.set('a', a); f.guild.voiceStates.cache.set('b', f.state('b', 'general'));
    f.send.mockRejectedValueOnce(new Error('Missing Attach Files permission'));
    await f.service.start(); jest.setSystemTime(30000); await f.service.flush(); await f.service.flush();
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(f.send.mock.calls[1][0]).toEqual({ embeds: [{ title: 'Level Up', description: 'Othinus reached level 1' }], allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } });
    expect(f.balances.get('a').xp).toBe(100n);
    expect(a.member.roles.cache.has('one')).toBe(true);
    await f.service.onModuleDestroy();
  });

  it('does not announce until the XP transaction commits', async () => {
    const f = fixture(); f.settings.voiceLevelUpChannelId = 'logs';
    f.balances.set('a', { xp: 95n, remainder: 0 });
    f.guild.voiceStates.cache.set('a', f.state('a', 'general')); f.guild.voiceStates.cache.set('b', f.state('b', 'general'));
    await f.service.start(); jest.setSystemTime(30000);
    f.prisma.$transaction.mockRejectedValueOnce(new Error('database unavailable'));
    await f.service.flush(); expect(f.send).not.toHaveBeenCalled();
    await f.service.flush(); expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.balances.get('a').xp).toBe(100n);
    await f.service.onModuleDestroy();
  });

  it('keeps committed XP and role rewards when level-up delivery fails', async () => {
    const f = fixture(); f.settings.voiceLevelUpChannelId = 'logs'; f.addRole('one', 1);
    const a = f.state('a', 'general'); f.balances.set('a', { xp: 95n, remainder: 0 });
    f.guild.voiceStates.cache.set('a', a); f.guild.voiceStates.cache.set('b', f.state('b', 'general'));
    f.send.mockRejectedValue(new Error('Discord unavailable'));
    await f.service.start(); jest.setSystemTime(30000); await f.service.flush(); await f.service.flush();
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.balances.get('a').xp).toBe(100n);
    expect(a.member.roles.cache.has('one')).toBe(true);
    await f.service.onModuleDestroy();
  });

  it.each([null, 'logs'])('does not announce an existing level or disabled destination %s', async (channelId) => {
    const f = fixture(); f.settings.voiceLevelUpChannelId = channelId;
    f.balances.set('a', { xp: channelId ? 100n : 95n, remainder: 0 });
    f.guild.voiceStates.cache.set('a', f.state('a', 'general')); f.guild.voiceStates.cache.set('b', f.state('b', 'general'));
    await f.service.start(); jest.setSystemTime(30000); await f.service.flush();
    expect(f.send).not.toHaveBeenCalled();
    await f.service.onModuleDestroy();
  });

  it.each([
    [null, 'general', 'Voice Join', 'Othinus joined voice General'],
    ['general', null, 'Voice Leave', 'Othinus left voice General'],
    ['general', 'lounge', 'Voice Move', 'Othinus moved from General to Lounge'],
  ])('sends one plain embed for %s → %s', async (from, to, title, description) => {
    const f = fixture(); f.settings.voiceXpEnabled = false; f.settings.voiceNotificationChannelId = 'logs';
    await f.change(f.state('a', from), f.state('a', to));
    expect(f.send).toHaveBeenCalledTimes(1);
    const payload = f.send.mock.calls[0][0];
    expect(payload.embeds).toEqual([{ title, description }]);
    expect(payload.allowedMentions.parse).toEqual([]);
    await f.service.onModuleDestroy();
  });

  it('suppresses disabled, bot and mute-only notifications', async () => {
    const f = fixture(); await f.change(f.state('a', null), f.state('a', 'general'));
    f.settings.voiceNotificationChannelId = 'logs';
    await f.change(f.state('a', 'general'), f.state('a', 'general', { selfMute: true }));
    await f.change(f.state('bot', null), f.state('bot', 'general', { member: { user: { bot: true } } }));
    expect(f.send).not.toHaveBeenCalled();
    await f.service.onModuleDestroy();
  });

  it('escapes names and suppresses all mentions', async () => {
    const f = fixture(); f.settings.voiceNotificationChannelId = 'logs';
    const next = f.state('a', 'general'); next.member.displayName = '*Name* [link](https://example.com) <@123>';
    await f.change(f.state('a', null), next);
    const payload = f.send.mock.calls[0][0];
    expect(payload.embeds[0].description).toContain('\\*Name\\*');
    expect(payload.embeds[0].description).toContain('\\[link](https://example.com)');
    expect(payload.embeds[0].description).not.toContain('<@123>');
    expect(payload.allowedMentions).toEqual({ parse: [], users: [], roles: [], repliedUser: false });
    await f.service.onModuleDestroy();
  });

  it.each(['missing', 'stage', 'no permissions'])('rejects an invalid notification destination: %s', async (kind) => {
    const f = fixture();
    if (kind === 'no permissions') f.guild.members.me.permissions = new PermissionsBitField();
    await expect(f.service.validateNotificationChannel('guild', kind === 'no permissions' ? 'logs' : kind)).rejects.toThrow();
    await f.service.onModuleDestroy();
  });

  it.each(['managed', 'everyone', 'higher', 'missing', 'no permissions'])('rejects an unassignable reward role: %s', async (kind) => {
    const f = fixture(); const role = f.addRole(kind === 'everyone' ? 'guild' : 'reward', 1);
    if (kind === 'managed') role.managed = true;
    if (kind === 'higher') role.comparePositionTo = () => 1;
    if (kind === 'no permissions') f.guild.members.me.permissions = new PermissionsBitField();
    await expect(f.service.validateRewardRoles('guild', [kind === 'missing' ? 'missing' : role.id])).rejects.toThrow();
    await f.service.onModuleDestroy();
  });

  it('does not credit time or remove roles when a settings transaction fails', async () => {
    const f = fixture();
    f.guild.voiceStates.cache.set('a', f.state('a', 'general')); f.guild.voiceStates.cache.set('b', f.state('b', 'general'));
    await f.service.start(); jest.setSystemTime(30000);
    await expect(f.service.withGuildSettingsUpdate('guild', async () => { throw new Error('rollback'); })).rejects.toThrow('rollback');
    jest.setSystemTime(60000); await f.service.flush();
    expect(f.balances.get('a').xp).toBe(10n);
    await f.service.onModuleDestroy();
  });

  it.each(['leave', 'disconnect'])('gives rewards reached during final %s settlement', async (kind) => {
    const f = fixture(); const a = f.state('a', 'general'); const b = f.state('b', 'general');
    f.addRole('one', 1);
    f.balances.set('b', { guildId: 'guild', userId: 'b', xp: 95n, remainder: 0 });
    f.guild.voiceStates.cache.set('a', a); f.guild.voiceStates.cache.set('b', b);
    await f.service.start(); jest.setSystemTime(30000);
    if (kind === 'leave') await f.change(b, f.state('b', null));
    else await f.service.disconnect();
    expect(f.balances.get('b').xp).toBe(100n);
    expect(b.member.roles.cache.has('one')).toBe(true);
    await f.service.onModuleDestroy();
  });

  it('settles departed uncached members without phantom XP', async () => {
    const f = fixture(); const b = f.state('b', 'general');
    f.guild.voiceStates.cache.set('a', f.state('a', 'general')); f.guild.voiceStates.cache.set('b', b);
    await f.service.start(); jest.setSystemTime(30000);
    await f.change(b, f.state('b', null, { member: null }));
    jest.setSystemTime(120000); await f.service.flush();
    expect(f.balances.get('a').xp).toBe(5n);
    expect(f.balances.get('b').xp).toBe(5n);
    await f.service.onModuleDestroy();
  });

  it('starts live tracking when settings enable a guild added after ready', async () => {
    const f = fixture(); const guilds = new Collection<string, any>();
    f.service.setClient({ guilds: { cache: guilds }, isReady: () => true } as any);
    await f.service.start();
    guilds.set('guild', f.guild);
    f.guild.voiceStates.cache.set('a', f.state('a', 'general')); f.guild.voiceStates.cache.set('b', f.state('b', 'general'));
    await f.service.withGuildSettingsUpdate('guild', async () => {});
    jest.setSystemTime(60000); await f.service.flush();
    expect(f.balances.get('a')?.xp).toBe(10n);
    await f.service.onModuleDestroy();
  });

  it('refreshes live participants when enabling XP', async () => {
    const f = fixture(); f.settings.voiceXpEnabled = false;
    await f.service.start();
    f.guild.voiceStates.cache.set('a', f.state('a', 'general')); f.guild.voiceStates.cache.set('b', f.state('b', 'general'));
    await f.service.withGuildSettingsUpdate('guild', async () => { f.settings.voiceXpEnabled = true; });
    jest.setSystemTime(60000); await f.service.flush();
    expect(f.balances.get('a')?.xp).toBe(10n);
    await f.service.onModuleDestroy();
  });

  it('notification failures do not block XP', async () => {
    const f = fixture(); f.settings.voiceNotificationChannelId = 'logs';
    f.send.mockRejectedValue(new Error('Discord unavailable'));
    const a = f.state('a', 'general'); const b = f.state('b', 'general');
    f.guild.voiceStates.cache.set('a', a); await f.service.start();
    await f.change(f.state('b', null), b); jest.setSystemTime(60000); await f.service.flush();
    expect(f.balances.get('a').xp).toBe(10n);
    await f.service.onModuleDestroy();
  });
});
