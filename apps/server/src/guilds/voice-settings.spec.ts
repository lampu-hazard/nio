import 'reflect-metadata';
import { describe, expect, it, jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { GuildsService } from './guilds.service';
import { GuildsController } from './guilds.controller';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { GuildAccessGuard } from './guards/guild-access.guard';

const roleId = '123456789012345678';

describe('voice settings validation', () => {
  it.each([
    { voiceXpPerMinute: 0 }, { voiceXpPerMinute: 1001 }, { voiceXpPerMinute: 1.5 }, { voiceXpPerMinute: null },
    { voiceXpEnabled: null }, { voiceXpRewards: null }, { voiceXpRewards: [{ level: 0, roleId }] },
    { voiceXpRewards: [{ level: 10001, roleId }] }, { voiceXpRewards: [{ level: 1.5, roleId }] },
    { voiceXpRewards: [{ level: 1, roleId: 'invalid' }] }, { voiceNotificationChannelId: 'invalid' },
    { voiceXpRewards: Array.from({ length: 51 }, (_, i) => ({ level: i + 1, roleId })) },
  ])('rejects invalid input %j', async (input) => {
    expect((await validate(plainToInstance(UpdateSettingsDto, input))).length).toBeGreaterThan(0);
  });
  it('allows notification disabling and omitted properties', async () => {
    expect(await validate(plainToInstance(UpdateSettingsDto, { voiceNotificationChannelId: null }))).toHaveLength(0);
    expect(await validate(plainToInstance(UpdateSettingsDto, {}))).toHaveLength(0);
  });
});

function fixture() {
  let saved: any = { guildId: 'guild', voiceXpEnabled: true, voiceXpPerMinute: 20, voiceNotificationChannelId: null };
  let rewards: any[] = [{ level: 5, roleId }];
  const tx: any = {
    guildSettings: {
      findUnique: jest.fn(async () => ({ ...saved })),
      upsert: jest.fn(async ({ update }: any) => { for (const [key, value] of Object.entries(update)) if (value !== undefined) saved[key] = value; return { ...saved }; }),
    },
    voiceXpReward: {
      findMany: jest.fn(async () => [...rewards]),
      deleteMany: jest.fn(async () => { rewards = []; }),
      createMany: jest.fn(async ({ data }: any) => { rewards = data; }),
    },
  };
  const prisma: any = { ...tx, $transaction: jest.fn(async (fn: any) => {
    const oldSaved = { ...saved }; const oldRewards = [...rewards];
    try { return await fn(tx); } catch (err) { saved = oldSaved; rewards = oldRewards; throw err; }
  }) };
  const voice: any = { withGuildSettingsUpdate: jest.fn(async (_guildId: string, fn: any) => fn()), validateNotificationChannel: jest.fn(async () => {}), validateRewardRoles: jest.fn(async () => {}) };
  const cache = { updateGuildCache: () => {} };
  const service = new (GuildsService as any)({}, prisma, {}, cache, cache, {}, voice) as GuildsService;
  return { service, prisma, voice, getSaved: () => saved, getRewards: () => rewards };
}

describe('voice settings persistence', () => {
  it('keeps session and guild authorization on settings endpoints', () => {
    expect(Reflect.getMetadata('__guards__', GuildsController)).toContain(SessionAuthGuard);
    expect(Reflect.getMetadata('__guards__', GuildsController.prototype.getSettings)).toContain(GuildAccessGuard);
    expect(Reflect.getMetadata('__guards__', GuildsController.prototype.updateSettings)).toContain(GuildAccessGuard);
  });
  it('returns defaults for a guild without settings', async () => {
    const f = fixture(); f.prisma.guildSettings.findUnique.mockResolvedValue(null);
    expect(await f.service.getSettings('guild')).toMatchObject({ voiceXpEnabled: false, voiceXpPerMinute: 10, voiceNotificationChannelId: null, voiceXpRewards: [{ level: 5, roleId }] });
  });
  it('preserves omitted properties on reward-only PATCH', async () => {
    const f = fixture();
    const result = await f.service.updateSettings('guild', plainToInstance(UpdateSettingsDto, { voiceXpRewards: [{ level: 10, roleId }] }));
    expect(result).toMatchObject({ voiceXpEnabled: true, voiceXpPerMinute: 20, voiceXpRewards: [{ level: 10, roleId }] });
  });
  it.each([
    [{ level: 5, roleId }, { level: 5, roleId: '223456789012345678' }],
    [{ level: 5, roleId }, { level: 10, roleId }],
  ])('rejects duplicate levels or roles', async (...rewards) => {
    const f = fixture();
    await expect(f.service.updateSettings('guild', plainToInstance(UpdateSettingsDto, { voiceXpRewards: rewards }))).rejects.toThrow();
    expect(f.getRewards()).toEqual([{ level: 5, roleId }]);
  });
  it('rolls settings and rewards back when replacement fails', async () => {
    const f = fixture(); f.prisma.voiceXpReward.createMany.mockRejectedValueOnce(new Error('write failed'));
    await expect(f.service.updateSettings('guild', plainToInstance(UpdateSettingsDto, { voiceXpPerMinute: 30, voiceXpRewards: [{ level: 10, roleId }] }))).rejects.toThrow('write failed');
    expect(f.getSaved().voiceXpPerMinute).toBe(20);
    expect(f.getRewards()).toEqual([{ level: 5, roleId }]);
  });
  it('does not save channels or roles rejected by Discord permission checks', async () => {
    const f = fixture(); f.voice.validateRewardRoles.mockRejectedValueOnce(new Error('role forbidden'));
    await expect(f.service.updateSettings('guild', plainToInstance(UpdateSettingsDto, { voiceXpRewards: [{ level: 10, roleId }] }))).rejects.toThrow('role forbidden');
    expect(f.getRewards()).toEqual([{ level: 5, roleId }]);
    f.voice.validateNotificationChannel.mockRejectedValueOnce(new Error('channel forbidden'));
    await expect(f.service.updateSettings('guild', plainToInstance(UpdateSettingsDto, { voiceNotificationChannelId: roleId }))).rejects.toThrow('channel forbidden');
    expect(f.getSaved().voiceNotificationChannelId).toBeNull();
  });
});
