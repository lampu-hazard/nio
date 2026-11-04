import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PermissionFlagsBits } from 'discord.js';
import { AiAgentSettingsService } from './ai-agent-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialEncryptionService } from '../plugins/credential-encryption.service';

describe('AiAgentSettingsService', () => {
  const row = {
    guildId: 'guild-1', profile: 'PUBLIC', tokenQuotaMode: 'LIMITED', enabled: true, provider: 'gemini', model: 'gemini-2.5-flash',
    baseUrl: null, encryptedApiKey: 'ciphertext', allowedUserIds: ['user-1'],
    allowedChannelIds: ['30000'], excludedChannelIds: [], systemPrompt: null, messageRetentionDays: 30,
    accessMode: 'ROLE_QUOTAS', roleRules: [{ roleId: '20000', chatEnabled: true, imageEnabled: false, dailyTokenLimit: 1000, dailyImageLimit: 0 }],
    createdAt: new Date(), updatedAt: new Date(),
  };
  const prisma = {
    $transaction: jest.fn<any>(async (work: any) => work(prisma)),
    $queryRaw: jest.fn<any>(async () => []),
    discordAgentSettings: {
      findUnique: jest.fn<any>(async () => row),
      upsert: jest.fn<any>(async ({ create }: any) => ({ ...row, ...create, roleRules: create.roleRules?.create ?? [] })),
      findMany: jest.fn<any>(async () => []),
    },
    agentInteractionLog: {
      groupBy: jest.fn<any>(async ({ where }: any) => where.status ? [{ userId: 'user-1', _count: { _all: 1 } }] : [{ userId: 'user-1', _count: { _all: 2 }, _sum: { promptTokens: 20, completionTokens: 10, totalTokens: 30 } }]),
    },
  };
  const encryption = {
    encrypt: jest.fn((value: string) => `encrypted:${value}`),
    decrypt: jest.fn((value: string) => `decrypted:${value}`),
  };
  let service: AiAgentSettingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockReset().mockImplementation(async (work: any) => work(prisma));
    service = new AiAgentSettingsService(prisma as unknown as PrismaService, encryption as unknown as CredentialEncryptionService);
    service.setClient({ guilds: { cache: new Map([['guild-1', { id: 'guild-1',
      roles: { fetch: async () => new Map([['20000', {}]]) },
      members: { fetchMe: async () => ({ id: 'bot' }) },
      channels: { fetch: async (id: string) => ({ id, guildId: 'guild-1', parentId: null, isTextBased: () => true,
        isThread: () => false, permissionsFor: () => ({ has: () => true }) }) },
    }]]) } } as any);
  });

  it.each(['deleted role', 'missing view', 'missing send', 'locked thread', 'unavailable bot'])('rejects activation with %s', async (reason) => {
    const permissions = { has: (flag: bigint) => flag !== (reason === 'missing view' ? PermissionFlagsBits.ViewChannel : reason === 'missing send' ? PermissionFlagsBits.SendMessages : 0n) };
    service.setClient({ guilds: { cache: new Map([['guild-1', {
      roles: { fetch: async () => new Map(reason === 'deleted role' ? [] : [['20000', {}]]) },
      members: { fetchMe: async () => reason === 'unavailable bot' ? null : { id: 'bot' } },
      channels: { fetch: async (id: string) => ({ id, guildId: 'guild-1', parentId: null, isTextBased: () => true,
        isThread: () => reason === 'locked thread', locked: reason === 'locked thread', permissionsFor: () => permissions }) },
    }]]) } } as any);
    await expect(service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, { enabled: true })).rejects.toThrow();
    expect(prisma.discordAgentSettings.upsert).not.toHaveBeenCalled();
  });

  it('rejects parent/thread assignments across profiles', async () => {
    prisma.discordAgentSettings.findMany.mockResolvedValueOnce([{ profile: 'ADMIN', allowedChannelIds: ['30001'] }]);
    service.setClient({ guilds: { cache: new Map([['guild-1', {
      channels: { fetch: async (id: string) => ({ id, guildId: 'guild-1', parentId: id === '30001' ? '30000' : null, isTextBased: () => true }) },
    }]]) } } as any);
    await expect(service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, { allowedChannelIds: ['30000'] })).rejects.toThrow('another profile');
  });

  it('represents ADMIN with explicit unlimited mode and rejects token editors', async () => {
    prisma.discordAgentSettings.findUnique.mockResolvedValueOnce(null);
    expect(await service.getSettings({ guildId: 'guild-1', profile: 'ADMIN' })).toMatchObject({
      profile: 'ADMIN', tokenQuotaMode: 'UNLIMITED', dailyGuildTokenLimit: null, maxRunTokens: null, userTokenRules: [],
    });
    for (const dto of [{ dailyGuildTokenLimit: 100 }, { maxRunTokens: 10000 }, { userTokenRules: [] }]) {
      await expect(service.updateSettings({ guildId: 'guild-1', profile: 'ADMIN' }, dto as any)).rejects.toThrow();
    }
  });

  it('rejects shared channel assignment under the guild save lock', async () => {
    prisma.discordAgentSettings.findMany.mockResolvedValueOnce([{ profile: 'ADMIN', allowedChannelIds: ['30000'], excludedChannelIds: [] }]);
    await expect(service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, { allowedChannelIds: ['30000'] })).rejects.toThrow('another profile');
    expect(prisma.discordAgentSettings.upsert).not.toHaveBeenCalled();
  });

  it.each([{ systemPrompt: 'x'.repeat(32001) }, { messageRetentionDays: 0 }, { messageRetentionDays: 91 }, { allowedChannelIds: ['*'] }])('validates profile prompt/channel bounds %j', async (dto) => {
    await expect(service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, dto as any)).rejects.toThrow();
  });

  it('masks encrypted credentials from settings responses', async () => {
    const result = await service.getSettings({ guildId: 'guild-1', profile: 'PUBLIC' });
    expect(result).toMatchObject({ hasCredential: true, provider: 'gemini' });
    expect(result).not.toHaveProperty('encryptedApiKey');
    expect(result).not.toHaveProperty('apiKey');
  });

  it('encrypts replacement keys and reports only credential status', async () => {
    const result = await service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, { apiKey: '  secret-key  ' });
    expect(encryption.encrypt).toHaveBeenCalledWith('secret-key');
    expect(prisma.discordAgentSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ encryptedApiKey: 'encrypted:secret-key' }),
    }));
    expect(result).not.toHaveProperty('encryptedApiKey');
    expect(result).not.toHaveProperty('apiKey');
  });

  it('throws friendly BadRequestException when encryption key is not configured', async () => {
    encryption.encrypt.mockImplementationOnce(() => {
      throw new Error('Plugin credential encryption is not configured');
    });
    await expect(service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, { apiKey: 'secret' })).rejects.toThrow(
      'PLUGIN_CREDENTIALS_ENCRYPTION_KEY belum dikonfigurasi',
    );
  });

  it.each([
    { dailyGuildTokenLimit: 0 }, { dailyGuildTokenLimit: 1000000001 },
    { dailyGuildImageLimit: -1 }, { dailyGuildImageLimit: 10001 },
    { maxOutputTokens: 127 }, { maxOutputTokens: 8193 },
    { maxRunTokens: 1023 }, { maxRunTokens: 262145 },
    { maxOutputTokens: 2048, maxRunTokens: 1024 },
    { imageEnabled: true, accessMode: 'LEGACY_USERS' },
    { imageBaseUrl: 'https://localhost/v1' },
    { imageBaseUrl: 'https://127.0.0.1/v1' },
    { imageBaseUrl: 'https://10.0.0.1/v1' },
    { imageBaseUrl: 'https://[::1]/v1' },
    { imageBaseUrl: 'https://provider.example:8443/v1' },
    { imageApiKey: 'key', clearImageApiKey: true },
    { roleRules: [{ roleId: '20000', chatEnabled: true, imageEnabled: false, dailyTokenLimit: 0, dailyImageLimit: 0 }] },
    { roleRules: Array.from({ length: 101 }, (_, n) => ({ roleId: String(20000 + n), chatEnabled: false, imageEnabled: false, dailyTokenLimit: 0, dailyImageLimit: 0 })) },
  ])('rejects invalid effective settings %j', async (dto) => {
    await expect(service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, dto as any)).rejects.toThrow();
    expect(prisma.discordAgentSettings.upsert).not.toHaveBeenCalled();
  });

  it('saves personal custom and unlimited token rules without changing role policy', async () => {
    const userTokenRules = [{ userId: '40000', dailyTokenLimit: 50 }, { userId: '50000', dailyTokenLimit: null }];
    const result = await service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, { userTokenRules } as any);
    expect(result).toMatchObject({ userTokenRules });
  });

  it.each([
    null, [{ userId: '*', dailyTokenLimit: null }], [{ userId: 40000, dailyTokenLimit: null }], [{ userId: '40000' }],
    [{ userId: '40000', dailyTokenLimit: 0 }], [{ userId: '40000', dailyTokenLimit: 1.5 }],
    [{ userId: '40000', dailyTokenLimit: 100000001 }],
    [{ userId: '40000', dailyTokenLimit: null }, { userId: '40000', dailyTokenLimit: 50 }],
  ])('rejects invalid personal rules %j', async (userTokenRules) => {
    await expect(service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, { userTokenRules } as any)).rejects.toThrow();
    expect(prisma.discordAgentSettings.upsert).not.toHaveBeenCalled();
  });

  it('allows maxRunTokens equal to maxOutputTokens (e.g. 2048 and 2048)', async () => {
    await expect(service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, { maxOutputTokens: 2048, maxRunTokens: 2048 })).resolves.toMatchObject({
      maxOutputTokens: 2048,
      maxRunTokens: 2048,
    });
  });

  it('redacts both keys and serializes policy revision for JSON', async () => {
    prisma.discordAgentSettings.findUnique.mockResolvedValueOnce({ ...row, encryptedImageApiKey: 'image-cipher', policyRevision: 3n });
    const result = await service.getSettings({ guildId: 'guild-1', profile: 'PUBLIC' });
    expect(result).toMatchObject({ hasImageCredential: true, policyRevision: '3' });
    expect(JSON.stringify(result)).not.toContain('image-cipher');
    expect(result).not.toHaveProperty('encryptedImageApiKey');
  });

  it('validates shared-key origin when only chat base URL changes', async () => {
    prisma.discordAgentSettings.findUnique.mockResolvedValueOnce({ ...row, accessMode: 'ROLE_QUOTAS', provider: 'openai-compatible',
      baseUrl: 'https://old.example/v1', imageBaseUrl: 'https://old.example/v1', imageCredentialSource: 'CHAT' });
    await expect(service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, { baseUrl: 'https://other.example/v1' })).rejects.toThrow();
  });

  it('retries serialization conflicts at most three times without retrying validation errors', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' }).mockRejectedValueOnce({ code: 'P2034' });
    await service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, { model: 'retried' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('stops after the third serialization conflict', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' }).mockRejectedValueOnce({ code: 'P2034' }).mockRejectedValueOnce({ code: 'P2034' });
    await expect(service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, { model: 'retried' })).rejects.toMatchObject({ code: 'P2034' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('rejects duplicate roles before persistence', async () => {
    const rule = { roleId: '20000', chatEnabled: true, imageEnabled: false, dailyTokenLimit: 10, dailyImageLimit: 0 };
    await expect(service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, { roleRules: [rule, rule] })).rejects.toThrow();
    expect(prisma.discordAgentSettings.upsert).not.toHaveBeenCalled();
  });

  it('rejects foreign roles even if structurally valid', async () => {
    service.setClient({ guilds: { cache: new Map([['guild-1', { roles: { fetch: async () => new Map() } }]]) } } as any);
    await expect(service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, { roleRules: [{ roleId: '20000', chatEnabled: true, imageEnabled: false, dailyTokenLimit: 10, dailyImageLimit: 0 }] })).rejects.toThrow('available role');
  });

  it('preserves an unchanged unavailable role on unrelated or full-form saves without passing deleteMany into upsert.create', async () => {
    const rule = { roleId: '20000', chatEnabled: true, imageEnabled: false, dailyTokenLimit: 10, dailyImageLimit: 0 };
    prisma.discordAgentSettings.findUnique.mockResolvedValueOnce({ ...row, roleRules: [rule] });
    await service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, { roleRules: [rule], model: 'replacement' });
    const call = prisma.discordAgentSettings.upsert.mock.calls[0][0] as any;
    expect(call.create.roleRules).toEqual({ create: [rule] });
    expect(call.update.roleRules).toEqual({ deleteMany: {}, create: [rule] });
    expect(call.update).toMatchObject({ model: 'replacement', policyRevision: { increment: 1n } });
  });

  it('clears only the separate image key and preserves omitted chat key', async () => {
    await service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, { clearImageApiKey: true });
    const call = prisma.discordAgentSettings.upsert.mock.calls[0][0] as any;
    expect(call.update.encryptedImageApiKey).toBeNull();
    expect(call.update).not.toHaveProperty('encryptedApiKey');
    expect(call.update).not.toHaveProperty('clearImageApiKey');
  });

  it('does not accept caller-supplied quota counters or encrypted keys', async () => {
    await expect(service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, { policyRevision: 999n, encryptedImageApiKey: 'injected' } as any)).rejects.toThrow();
    expect(prisma.discordAgentSettings.upsert).not.toHaveBeenCalled();
  });

  it('creates new configurations disabled in role mode without grants', async () => {
    prisma.discordAgentSettings.findUnique.mockResolvedValueOnce(null);
    const result = await service.updateSettings({ guildId: 'guild-1', profile: 'PUBLIC' }, { model: 'new-model' });
    expect(result).toMatchObject({ enabled: false, accessMode: 'ROLE_QUOTAS', roleRules: [] });
  });

  it('returns per-user token totals and failure counts without prompts', async () => {
    const result = await service.getUsage({ guildId: 'guild-1', profile: 'PUBLIC' }, 500);
    expect(result.days).toBe(90);
    expect(result.users[0]).toMatchObject({ userId: 'user-1', requests: 2, failures: 1, totalTokens: 30 });
    expect(result.users[0]).not.toHaveProperty('prompt');
    expect(prisma.agentInteractionLog.groupBy).toHaveBeenCalledTimes(2);
  });

  it('enriches user usage with discord member details when client is available', async () => {
    const mockMember = {
      displayName: 'Wign',
      user: { username: 'wign_dc', displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/user-1/avatar.png' },
      displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/user-1/avatar.png',
    };
    const mockGuild = {
      members: {
        cache: new Map([['user-1', mockMember]]),
        fetch: jest.fn<any>(async () => mockMember),
      },
    };
    const mockClient = {
      guilds: {
        cache: new Map([['guild-1', mockGuild]]),
        fetch: jest.fn<any>(async () => mockGuild),
      },
    };
    service.setClient(mockClient as any);
    const result = await service.getUsage({ guildId: 'guild-1', profile: 'PUBLIC' }, 30);
    expect(result.users[0]).toMatchObject({
      userId: 'user-1',
      displayName: 'Wign',
      username: 'wign_dc',
      avatarUrl: 'https://cdn.discordapp.com/avatars/user-1/avatar.png',
    });
  });
});
