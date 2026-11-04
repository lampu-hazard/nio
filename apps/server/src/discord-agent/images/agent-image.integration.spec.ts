import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import sharp from 'sharp';
import { createQuotaTestDatabase } from '../../../test/agent-quota-db';
import { AgentQuotaService } from '../quota/agent-quota.service';
import { AgentAccessService } from '../agent-access.service';
import { AgentImageService } from './agent-image.service';
import { OpenAiImageProvider } from './openai-image.provider';
import { ImageHttpError } from './public-image-http.service';
import { parseImageCommand } from './image-command';
import { deliverAgentReply } from '../../discord/agent-reply';
import { PrismaService } from '../../prisma/prisma.service';
import { AiAgentSettingsService } from '../ai-agent-settings.service';

describe('PostgreSQL cross-layer image routing, quota, and attachment delivery', () => {
  let db: Awaited<ReturnType<typeof createQuotaTestDatabase>>;
  let quotas: AgentQuotaService[];
  let png1024: Buffer;
  const guildId = 'image-quota-test-guild';

  beforeAll(async () => {
    png1024 = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: { r: 20, g: 40, b: 80 } },
    }).png().toBuffer();
    db = await createQuotaTestDatabase();
    quotas = db.clients.map((client) => new AgentQuotaService(client as PrismaService));
  }, 180000);
  afterAll(async () => { if (db) await db.close(); });
  beforeEach(async () => {
    const client = db.clients[0];
    await client.agentQuotaAttempt.deleteMany();
    await client.agentQuotaBucket.deleteMany();
    await client.agentMemberLease.deleteMany();
    await client.agentRoleRule.deleteMany({ where: { guildId } });
    await client.discordAgentSettings.upsert({
      where: { guildId_profile: { guildId, profile: 'PUBLIC' } },
      create: {
        guildId, profile: 'PUBLIC', enabled: true, provider: 'openai-compatible', model: 'chat',
        baseUrl: 'https://api.example.com/v1', encryptedApiKey: 'enc:chat-key',
        allowedChannelIds: ['c1'],
        accessMode: 'ROLE_QUOTAS', tokenQuotaMode: 'LIMITED', policyRevision: 1n,
        dailyGuildTokenLimit: 10000, dailyGuildImageLimit: 5,
        maxOutputTokens: 512, maxRunTokens: 2048,
        imageEnabled: true, imageBaseUrl: 'https://api.example.com/v1',
        imageModel: 'gpt-image-1', imageCredentialSource: 'CHAT',
        roleRules: { create: [{ roleId: 'role-img', chatEnabled: true, imageEnabled: true, dailyTokenLimit: 5000, dailyImageLimit: 2 }] },
      },
      update: {
        enabled: true, provider: 'openai-compatible', model: 'chat',
        baseUrl: 'https://api.example.com/v1', encryptedApiKey: 'enc:chat-key',
        allowedChannelIds: ['c1'],
        accessMode: 'ROLE_QUOTAS', tokenQuotaMode: 'LIMITED', policyRevision: 1n,
        dailyGuildTokenLimit: 10000, dailyGuildImageLimit: 5,
        maxOutputTokens: 512, maxRunTokens: 2048,
        imageEnabled: true, imageBaseUrl: 'https://api.example.com/v1',
        imageModel: 'gpt-image-1', imageCredentialSource: 'CHAT',
        roleRules: { deleteMany: {}, create: [{ roleId: 'role-img', chatEnabled: true, imageEnabled: true, dailyTokenLimit: 5000, dailyImageLimit: 2 }] },
      },
    });
  });

  function createStack(index: number, httpRequest: (req: any) => Promise<any>) {
    const client = db.clients[index] as PrismaService;
    const access = new AgentAccessService(client);
    access.setClient({
      guilds: {
        cache: new Map([[guildId, {
          roles: { fetch: async () => new Map([['role-img', { id: 'role-img' }]]) },
          members: {
            fetch: async () => ({
              guild: { id: guildId },
              roles: { cache: new Map([['role-img', { id: 'role-img' }]]) },
            }),
          },
        }]]),
      },
    } as any);
    const settings = { decryptApiKey: (value: string) => value.replace('enc:', '') } as unknown as AiAgentSettingsService;
    const provider = new OpenAiImageProvider({ request: httpRequest } as any);
    const service = new AgentImageService(access, quotas[index], provider, settings);
    return { service, provider };
  }

  it('authorizes role, reserves, calls provider once, validates real 1024x1024 PNG, commits, edits attachment, and deduplicates message ID', async () => {
    let providerCalls = 0;
    const httpRequest = async (req: any) => {
      providerCalls++;
      await req.beforeSend?.();
      return {
        status: 200,
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify({ data: [{ b64_json: png1024.toString('base64') }] })),
      };
    };
    const first = createStack(0, httpRequest);
    const second = createStack(1, httpRequest);
    const cmd = parseImageCommand('<@999> buat gambar pemandangan gunung', '999');
    expect(cmd).toEqual({ prompt: 'pemandangan gunung' });
    if (!cmd) throw new Error('expected generate');

    const res = await first.service.handle({ guildId, profile: 'PUBLIC', channelId: 'c1', userId: 'u1', messageId: 'm-dup', prompt: cmd.prompt, attachmentLimit: 8388608, canAttach: true });
    expect(res.files).toHaveLength(1);
    const edits: any[] = [];
    const delivery = await deliverAgentReply({
      message: { reply: async () => ({ id: 'r1' }) },
      loadingMessage: { edit: async (payload: any) => { edits.push(payload); return { id: 'l1' }; } },
      response: res,
    });
    expect(delivery).toEqual({ delivered: true, messageId: 'l1' });
    expect(edits[0].files[0]).toMatchObject({ name: 'nio-generated.png' });

    const dup = await second.service.handle({ guildId, profile: 'PUBLIC', channelId: 'c1', userId: 'u1', messageId: 'm-dup', prompt: cmd.prompt, attachmentLimit: 8388608, canAttach: true });
    expect(dup.content).toContain('sudah diproses');
    expect(providerCalls).toBe(1);
    const buckets = await db.clients[0].agentQuotaBucket.findMany({ where: { guildId } });
    expect(buckets.every((b) => b.committedImages === 1n && b.reservedImages === 0n && b.committedTokens === 0n)).toBe(true);
  });

  it('refunds pre-dispatch destination denials and blocks dispatch when policy lowers limit concurrently before markDispatched', async () => {
    let dispatchedSockets = 0;
    const deniedStack = createStack(0, async () => {
      throw new ImageHttpError('IMAGE_DESTINATION_DENIED');
    });
    const denied = await deniedStack.service.handle({ guildId, profile: 'PUBLIC', channelId: 'c1', userId: 'u1', messageId: 'm-pre', prompt: 'kucing', attachmentLimit: 8388608, canAttach: true });
    expect(denied.files).toBeUndefined();
    let buckets = await db.clients[0].agentQuotaBucket.findMany({ where: { guildId } });
    expect(buckets.every((b) => b.committedImages === 0n && b.reservedImages === 0n)).toBe(true);

    const loweredStack = createStack(0, async (req) => {
      await db.clients[1].discordAgentSettings.update({
        where: { guildId_profile: { guildId, profile: 'PUBLIC' } },
        data: { policyRevision: { increment: 1n }, dailyGuildImageLimit: 0 },
      });
      await req.beforeSend?.();
      dispatchedSockets++;
      return { status: 200, contentType: 'application/json', body: Buffer.from('{}') };
    });
    const lowered = await loweredStack.service.handle({ guildId, profile: 'PUBLIC', channelId: 'c1', userId: 'u1', messageId: 'm-low', prompt: 'kucing', attachmentLimit: 8388608, canAttach: true });
    expect(lowered.content).toContain('Kuota gambar harian');
    expect(dispatchedSockets).toBe(0);
    buckets = await db.clients[0].agentQuotaBucket.findMany({ where: { guildId } });
    expect(buckets.every((b) => b.committedImages === 0n && b.reservedImages === 0n)).toBe(true);
  });
});
