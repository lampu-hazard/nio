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
      update: { encryptedApiKey: 'encrypted:secret-key' },
    }));
    expect(result).not.toHaveProperty('encryptedApiKey');
    expect(result).not.toHaveProperty('apiKey');
  });

  it('returns per-user token totals and failure counts without prompts', async () => {
    const result = await service.getUsage('guild-1', 500);
    expect(result.days).toBe(90);
    expect(result.users[0]).toMatchObject({ userId: 'user-1', requests: 2, failures: 1, totalTokens: 30 });
    expect(result.users[0]).not.toHaveProperty('prompt');
    expect(prisma.agentInteractionLog.groupBy).toHaveBeenCalledTimes(2);
  });
});
