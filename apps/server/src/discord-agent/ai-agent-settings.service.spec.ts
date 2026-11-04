import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AiAgentSettingsService } from './ai-agent-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialEncryptionService } from '../plugins/credential-encryption.service';

describe('AiAgentSettingsService', () => {
  const row = {
    guildId: 'guild-1', enabled: true, provider: 'gemini', model: 'gemini-2.5-flash',
    baseUrl: null, encryptedApiKey: 'ciphertext', allowedUserIds: ['user-1'],
    allowedChannelIds: [], excludedChannelIds: [], systemPrompt: null, messageRetentionDays: 30,
    createdAt: new Date(), updatedAt: new Date(),
  };
  const prisma = {
    $transaction: jest.fn<any>(async (work: any) => work(prisma)),
    $queryRaw: jest.fn<any>(async () => []),
    discordAgentSettings: {
      findUnique: jest.fn<any>(async () => row),
      upsert: jest.fn<any>(async ({ create }: any) => ({ ...row, ...create })),
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
  });

  it('masks encrypted credentials from settings responses', async () => {
    const result = await service.getSettings('guild-1');
    expect(result).toMatchObject({ hasCredential: true, provider: 'gemini' });
    expect(result).not.toHaveProperty('encryptedApiKey');
    expect(result).not.toHaveProperty('apiKey');
  });

  it('encrypts replacement keys and reports only credential status', async () => {
    const result = await service.updateSettings('guild-1', { apiKey: '  secret-key  ' });
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
    await expect(service.updateSettings('guild-1', { apiKey: 'secret' })).rejects.toThrow(
      'PLUGIN_CREDENTIALS_ENCRYPTION_KEY belum dikonfigurasi',
    );
  });

  it.each([
    { dailyGuildTokenLimit: 0 }, { dailyGuildTokenLimit: 1000000001 },
    { dailyGuildImageLimit: -1 }, { dailyGuildImageLimit: 10001 },
    { maxOutputTokens: 127 }, { maxOutputTokens: 8193 },
    { maxRunTokens: 1023 }, { maxRunTokens: 262145 },
    { maxOutputTokens: 2048, maxRunTokens: 2048 },
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
    await expect(service.updateSettings('guild-1', dto as any)).rejects.toThrow();
    expect(prisma.discordAgentSettings.upsert).not.toHaveBeenCalled();
  });

  it('redacts both keys and serializes policy revision for JSON', async () => {
    prisma.discordAgentSettings.findUnique.mockResolvedValueOnce({ ...row, encryptedImageApiKey: 'image-cipher', policyRevision: 3n });
    const result = await service.getSettings('guild-1');
    expect(result).toMatchObject({ hasImageCredential: true, policyRevision: '3' });
    expect(JSON.stringify(result)).not.toContain('image-cipher');
    expect(result).not.toHaveProperty('encryptedImageApiKey');
  });

  it('validates shared-key origin when only chat base URL changes', async () => {
    prisma.discordAgentSettings.findUnique.mockResolvedValueOnce({ ...row, accessMode: 'ROLE_QUOTAS', provider: 'openai-compatible',
      baseUrl: 'https://old.example/v1', imageBaseUrl: 'https://old.example/v1', imageCredentialSource: 'CHAT' });
    await expect(service.updateSettings('guild-1', { baseUrl: 'https://other.example/v1' })).rejects.toThrow();
  });

  it('retries serialization conflicts at most three times without retrying validation errors', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' }).mockRejectedValueOnce({ code: 'P2034' });
    await service.updateSettings('guild-1', { model: 'retried' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('stops after the third serialization conflict', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' }).mockRejectedValueOnce({ code: 'P2034' }).mockRejectedValueOnce({ code: 'P2034' });
    await expect(service.updateSettings('guild-1', { model: 'retried' })).rejects.toMatchObject({ code: 'P2034' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('rejects duplicate roles before persistence', async () => {
    const rule = { roleId: '20000', chatEnabled: true, imageEnabled: false, dailyTokenLimit: 10, dailyImageLimit: 0 };
    await expect(service.updateSettings('guild-1', { roleRules: [rule, rule] })).rejects.toThrow();
    expect(prisma.discordAgentSettings.upsert).not.toHaveBeenCalled();
  });

  it('rejects foreign roles even if structurally valid', async () => {
    service.setClient({ guilds: { cache: new Map([['guild-1', { roles: { fetch: async () => new Map() } }]]) } } as any);
    await expect(service.updateSettings('guild-1', { roleRules: [{ roleId: '20000', chatEnabled: true, imageEnabled: false, dailyTokenLimit: 10, dailyImageLimit: 0 }] })).rejects.toThrow('available role');
  });

  it('preserves an unchanged unavailable role on unrelated or full-form saves', async () => {
    const rule = { roleId: '20000', chatEnabled: true, imageEnabled: false, dailyTokenLimit: 10, dailyImageLimit: 0 };
    prisma.discordAgentSettings.findUnique.mockResolvedValueOnce({ ...row, roleRules: [rule] });
    await service.updateSettings('guild-1', { roleRules: [rule], model: 'replacement' });
    expect(prisma.discordAgentSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ model: 'replacement', policyRevision: { increment: 1n } }),
    }));
  });

  it('clears only the separate image key and preserves omitted chat key', async () => {
    await service.updateSettings('guild-1', { clearImageApiKey: true });
    const call = prisma.discordAgentSettings.upsert.mock.calls[0][0] as any;
    expect(call.update.encryptedImageApiKey).toBeNull();
    expect(call.update).not.toHaveProperty('encryptedApiKey');
    expect(call.update).not.toHaveProperty('clearImageApiKey');
  });

  it('does not accept caller-supplied quota counters or encrypted keys', async () => {
    await expect(service.updateSettings('guild-1', { policyRevision: 999n, encryptedImageApiKey: 'injected' } as any)).rejects.toThrow();
    expect(prisma.discordAgentSettings.upsert).not.toHaveBeenCalled();
  });

  it('creates new configurations disabled in role mode without grants', async () => {
    prisma.discordAgentSettings.findUnique.mockResolvedValueOnce(null);
    const result = await service.updateSettings('guild-1', { model: 'new-model' });
    expect(result).toMatchObject({ enabled: false, accessMode: 'ROLE_QUOTAS', roleRules: [] });
  });

  it('returns per-user token totals and failure counts without prompts', async () => {
    const result = await service.getUsage('guild-1', 500);
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
    const result = await service.getUsage('guild-1', 30);
    expect(result.users[0]).toMatchObject({
      userId: 'user-1',
      displayName: 'Wign',
      username: 'wign_dc',
      avatarUrl: 'https://cdn.discordapp.com/avatars/user-1/avatar.png',
    });
  });
});
