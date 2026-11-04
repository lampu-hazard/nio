import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { PermissionFlagsBits } from 'discord.js';
import sharp from 'sharp';
import { createQuotaTestDatabase } from './agent-quota-db';
import { PrismaService } from '../src/prisma/prisma.service';
import { AgentQuotaService } from '../src/discord-agent/quota/agent-quota.service';
import { AgentQuotaQueryService } from '../src/discord-agent/quota/agent-quota-query.service';
import { AgentAccessService } from '../src/discord-agent/agent-access.service';
import { AgentProfileRouterService } from '../src/discord-agent/agent-profile-router.service';
import { AgentProfileManagerGuard } from '../src/discord-agent/agent-profile-manager.guard';
import { AgentToolPolicyService } from '../src/discord-agent/agent-tool-policy.service';
import { ConversationMemoryService } from '../src/discord-agent/conversation-memory.service';
import { AiAgentSettingsController } from '../src/discord-agent/ai-agent-settings.controller';
import { AiAgentSettingsService } from '../src/discord-agent/ai-agent-settings.service';
import { AgentImageService } from '../src/discord-agent/images/agent-image.service';
import { OpenAiImageProvider } from '../src/discord-agent/images/openai-image.provider';
import { DiscordAgentToolExecutorService } from '../src/discord-agent/discord-agent-tool-executor.service';
import { AgentActionProposalService } from '../src/discord-agent/agent-action-proposal.service';

describe('End-to-end PUBLIC and ADMIN profile separation, unlimited ADMIN tokens, and tool/proposal boundaries', () => {
  const guildId = 'guild-profiles-e2e';
  const publicChannelId = '100000000000000001';
  const adminChannelId = '100000000000000002';
  const publicRoleId = '200000000000000001';
  const adminRoleId = '200000000000000002';
  const memberUserId = '300000000000000001';
  const adminUserId = '300000000000000002';

  let currentRolesByUser: Map<string, string[]>;
  let currentPermissionsByUser: Map<string, bigint>;
  let redisStore: Map<string, string>;

  beforeEach(() => {
    currentRolesByUser = new Map([
      [memberUserId, [publicRoleId]],
      [adminUserId, [adminRoleId]],
    ]);
    currentPermissionsByUser = new Map([
      [memberUserId, PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages],
      [
        adminUserId,
        PermissionFlagsBits.ViewChannel
          | PermissionFlagsBits.SendMessages
          | PermissionFlagsBits.ManageGuild
          | PermissionFlagsBits.ModerateMembers,
      ],
    ]);
    redisStore = new Map();
  });

  function createDiscordClientStub() {
    const makeChannel = (id: string) => ({
      id,
      guildId,
      parentId: null,
      isTextBased: () => true,
      isThread: () => false,
      permissionsFor: (subject: any) => {
        const uid = typeof subject === 'string' ? subject : subject?.id;
        if (uid === 'bot-id') {
          return {
            has: () => true,
          };
        }
        const bits = currentPermissionsByUser.get(uid) ?? 0n;
        return {
          has: (flag: bigint) => (bits & flag) === flag,
        };
      },
    });

    const guildObj: any = {
      id: guildId,
      ownerId: 'owner-user-id',
      channels: {
        cache: new Map([
          [publicChannelId, makeChannel(publicChannelId)],
          [adminChannelId, makeChannel(adminChannelId)],
        ]),
        fetch: async (id: string) => makeChannel(id),
      },
      roles: {
        cache: new Map([
          [publicRoleId, { id: publicRoleId, position: 1 }],
          [adminRoleId, { id: adminRoleId, position: 10 }],
        ]),
        fetch: async () =>
          new Map([
            [publicRoleId, { id: publicRoleId, position: 1 }],
            [adminRoleId, { id: adminRoleId, position: 10 }],
          ]),
      },
      members: {
        fetchMe: async () => ({ id: 'bot-id', guild: { id: guildId }, roles: { highest: { position: 50 } } }),
        fetch: async (arg: any) => {
          const userId = typeof arg === 'string' ? arg : arg?.user;
          const roles = currentRolesByUser.get(userId);
          if (!roles) throw new Error('Unknown member');
          const bits = currentPermissionsByUser.get(userId) ?? 0n;
          return {
            id: userId,
            guild: { id: guildId },
            roles: {
              cache: new Map(roles.map((r) => [r, { id: r }])),
              highest: { position: roles.includes(adminRoleId) ? 10 : 1 },
            },
            permissions: {
              has: (flag: bigint) => (bits & flag) === flag,
            },
          };
        },
      },
    };

    return {
      user: { id: 'bot-id' },
      guilds: {
        cache: new Map([[guildId, guildObj]]),
        fetch: async () => guildObj,
      },
    } as any;
  }

  function createSettingsPrismaStub() {
    const settingsRows = new Map<string, any>([
      [
        `${guildId}:PUBLIC`,
        {
          guildId,
          profile: 'PUBLIC',
          enabled: true,
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          baseUrl: null,
          encryptedApiKey: 'enc:pub',
          allowedUserIds: [],
          allowedChannelIds: [publicChannelId],
          excludedChannelIds: [],
          accessMode: 'ROLE_QUOTAS',
          policyRevision: 1n,
          tokenQuotaMode: 'LIMITED',
          dailyGuildTokenLimit: 1000,
          dailyGuildImageLimit: 2,
          maxOutputTokens: 256,
          maxRunTokens: 1024,
          imageEnabled: true,
          imageBaseUrl: 'https://images.example.com/v1',
          imageModel: 'img-pub',
          imageCredentialSource: 'SEPARATE',
          encryptedImageApiKey: 'enc:pub-img',
          allowedToolIds: ['web_search', 'warn_user'],
          roleRules: [
            {
              guildId,
              profile: 'PUBLIC',
              roleId: publicRoleId,
              chatEnabled: true,
              imageEnabled: true,
              dailyTokenLimit: 500,
              dailyImageLimit: 1,
            },
          ],
        },
      ],
      [
        `${guildId}:ADMIN`,
        {
          guildId,
          profile: 'ADMIN',
          enabled: true,
          provider: 'openai-compatible',
          model: 'gpt-4.1',
          baseUrl: 'https://api.example.com/v1',
          encryptedApiKey: 'enc:adm',
          allowedUserIds: [],
          allowedChannelIds: [adminChannelId],
          excludedChannelIds: [],
          accessMode: 'ROLE_QUOTAS',
          policyRevision: 1n,
          tokenQuotaMode: 'UNLIMITED',
          dailyGuildTokenLimit: null,
          dailyGuildImageLimit: 1,
          maxOutputTokens: 1024,
          maxRunTokens: null,
          imageEnabled: true,
          imageBaseUrl: 'https://api.example.com/v1',
          imageModel: 'img-adm',
          imageCredentialSource: 'CHAT',
          encryptedImageApiKey: null,
          allowedToolIds: ['get_guild_overview', 'warn_user'],
          roleRules: [
            {
              guildId,
              profile: 'ADMIN',
              roleId: adminRoleId,
              chatEnabled: true,
              imageEnabled: true,
              dailyTokenLimit: null,
              dailyImageLimit: 1,
            },
          ],
        },
      ],
    ]);

    return {
      discordAgentSettings: {
        findUnique: async ({ where }: any) => {
          const key = `${where.guildId_profile.guildId}:${where.guildId_profile.profile}`;
          return settingsRows.get(key) ?? null;
        },
        findMany: async ({ where }: any) => {
          return [...settingsRows.values()].filter((row) => row.guildId === where.guildId);
        },
      },
    } as unknown as PrismaService;
  }

  it('enforces channel routing, PUBLIC tool allowlist, mid-run role revocation, conversation memory isolation, and fresh ADMIN manager guard', async () => {
    const discordClient = createDiscordClientStub();
    const prismaStub = createSettingsPrismaStub();

    const router = new AgentProfileRouterService(prismaStub);
    router.setClient(discordClient);
    const access = new AgentAccessService(prismaStub);
    access.setClient(discordClient);

    // 1. Channel routing resolves PUBLIC vs ADMIN strictly without cross-profile fallback
    expect(await router.resolve(guildId, publicChannelId)).toBe('PUBLIC');
    expect(await router.resolve(guildId, adminChannelId)).toBe('ADMIN');
    expect(await router.resolve(guildId, publicChannelId, 'ADMIN')).toBeNull();
    expect(await router.resolve(guildId, adminChannelId, 'PUBLIC')).toBeNull();

    // 2. PUBLIC injected admin tool (`warn_user`) is denied even if present in allowedToolIds; `web_search` is allowed
    const toolPolicy = new AgentToolPolicyService(
      access,
      { listTools: () => [] } as any,
      { getToolDefinitions: async () => [] } as any,
    );
    toolPolicy.setClient(discordClient);

    const pubDefs = await toolPolicy.definitions({
      guildId,
      profile: 'PUBLIC',
      channelId: publicChannelId,
      userId: memberUserId,
      requestedById: memberUserId,
    });
    expect(pubDefs.map((d) => d.name)).toEqual(['web_search']);
    await expect(
      toolPolicy.resolveCall(
        {
          guildId,
          profile: 'PUBLIC',
          channelId: publicChannelId,
          userId: memberUserId,
          requestedById: memberUserId,
        },
        'warn_user',
        { userId: memberUserId, reason: 'injected' },
      ),
    ).rejects.toThrow();

    // 3. Legitimate ADMIN read and write tools are exposed, write proposal is gated and requires confirmation, and revoking ADMIN role between steps blocks execution with zero side effects
    const admContext = {
      guildId,
      profile: 'ADMIN' as const,
      channelId: adminChannelId,
      userId: adminUserId,
      requestedById: adminUserId,
    };
    const admDefs = await toolPolicy.definitions(admContext);
    expect(admDefs.map((d) => d.name).sort()).toEqual(['get_guild_overview', 'warn_user']);

    let warnSideEffects = 0;
    const storedProposals = new Map<string, any>();
    const proposalPrisma = {
      ...(prismaStub as any),
      agentActionProposal: {
        create: async ({ data }: any) => {
          const record = { id: 'prop-1', createdAt: new Date(), ...data };
          storedProposals.set(record.id, record);
          return record;
        },
        findUnique: async ({ where }: any) => storedProposals.get(where.id) ?? null,
      },
    } as unknown as PrismaService;

    const proposalService = new AgentActionProposalService(
      proposalPrisma,
      { warnMember: async () => { warnSideEffects++; } } as any,
      {} as any,
      { listTools: () => [] } as any,
      toolPolicy,
    );
    proposalService.setClient(discordClient);

    const executor = new DiscordAgentToolExecutorService(
      { warnMember: async () => { warnSideEffects++; } } as any,
      proposalPrisma,
      proposalService,
      {} as any,
      { getGuildOverview: async () => ({ guildId, memberCount: 42 }) } as any,
      { has: () => false, getToolDefinitions: async () => [] } as any,
      undefined,
      undefined,
      toolPolicy,
    );
    executor.setClient(discordClient);

    const readResult = await executor.execute('get_guild_overview', {}, admContext);
    expect(readResult).toMatchObject({ id: guildId, ownerId: 'owner-user-id', channelCount: 2, roleCount: 2 });

    const writeResult = await executor.execute(
      'warn_user',
      { targetUserId: memberUserId, reason: 'spam' },
      admContext,
    );
    expect(writeResult).toEqual({ proposalCreated: true, proposalId: 'prop-1', actionType: 'WARN' });
    expect(storedProposals.get('prop-1')?.profile).toBe('ADMIN');
    expect(storedProposals.get('prop-1')?.originToolId).toBe('warn_user');
    expect(warnSideEffects).toBe(0);

    // Revoke adminRoleId mid-run and assert next tool call and proposal confirmation both fail with zero side effects
    currentRolesByUser.set(adminUserId, []);
    await expect(executor.execute('get_guild_overview', {}, admContext)).rejects.toThrow();
    await expect(proposalService.approveAndExecute('prop-1', adminUserId, guildId)).rejects.toThrow();
    expect(warnSideEffects).toBe(0);

    // 4. Conversation memory is strictly isolated by v2 guild/profile/channel/user key
    const memory = new ConversationMemoryService();
    await memory.onModuleDestroy();
    (memory as any).redis = {
      get: async (k: string) => redisStore.get(k) ?? null,
      set: async (k: string, v: string) => {
        redisStore.set(k, v);
        return 'OK';
      },
      quit: async () => 'OK',
    };
    await memory.saveConversation(
      { guildId, profile: 'PUBLIC', channelId: publicChannelId, userId: memberUserId },
      'bot-msg-1',
      [{ userPrompt: 'halo', aiResponse: 'hai', timestamp: 1000 }],
    );
    expect(
      await memory.loadHistory(
        { guildId, profile: 'PUBLIC', channelId: publicChannelId, userId: memberUserId },
        'bot-msg-1',
      ),
    ).toHaveLength(1);
    expect(
      await memory.loadHistory(
        { guildId, profile: 'ADMIN', channelId: publicChannelId, userId: memberUserId },
        'bot-msg-1',
      ),
    ).toEqual([]);
    expect(
      await memory.loadHistory(
        { guildId, profile: 'PUBLIC', channelId: publicChannelId, userId: adminUserId },
        'bot-msg-1',
      ),
    ).toEqual([]);

    // 5. Legacy controller route aliases ADMIN and fresh ADMIN manager guard rejects non-managers on ADMIN PATCH
    const managerGuard = new AgentProfileManagerGuard();
    managerGuard.setClient(discordClient);
    await expect(
      managerGuard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            params: { guildId, profile: 'ADMIN' },
            session: { user: { id: memberUserId } },
          }),
        }),
      } as any),
    ).rejects.toThrow('Current guild management permission required.');

    currentRolesByUser.set(adminUserId, [adminRoleId]);
    expect(
      await managerGuard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            params: { guildId, profile: 'ADMIN' },
            session: { user: { id: adminUserId } },
          }),
        }),
      } as any),
    ).toBe(true);

    const seenScopes: any[] = [];
    const controller = new AiAgentSettingsController(
      {
        getSettings: async (scope: any) => {
          seenScopes.push(scope);
          return { profile: scope.profile };
        },
      } as unknown as AiAgentSettingsService,
      {} as unknown as AgentQuotaQueryService,
    );
    await controller.getSettings(guildId);
    await controller.getProfileSettings(guildId, 'PUBLIC');
    expect(seenScopes).toEqual([
      { guildId, profile: 'ADMIN' },
      { guildId, profile: 'PUBLIC' },
    ]);
  });

  describe('Disposable PostgreSQL profile isolation, unlimited ADMIN tokens, and finite image quotas', () => {
    let db: Awaited<ReturnType<typeof createQuotaTestDatabase>>;
    let quotaServices: AgentQuotaService[];
    let queryService: AgentQuotaQueryService;
    let png1024: Buffer;

    beforeAll(async () => {
      png1024 = await sharp({
        create: { width: 1024, height: 1024, channels: 3, background: { r: 30, g: 60, b: 90 } },
      })
        .png()
        .toBuffer();
      db = await createQuotaTestDatabase();
      quotaServices = db.clients.map((client) => new AgentQuotaService(client as PrismaService));
    }, 180000);

    afterAll(async () => {
      if (db) await db.close();
    });

    beforeEach(async () => {
      const client = db.clients[0];
      await client.agentQuotaAttempt.deleteMany();
      await client.agentQuotaBucket.deleteMany();
      await client.agentMemberLease.deleteMany();
      await client.agentRoleRule.deleteMany({ where: { guildId } });
      await client.discordAgentSettings.deleteMany({ where: { guildId } });

      await client.discordAgentSettings.create({
        data: {
          guildId,
          profile: 'PUBLIC',
          enabled: true,
          provider: 'openai-compatible',
          model: 'gpt-4o-mini',
          baseUrl: 'https://api.example.com/v1',
          encryptedApiKey: 'enc:pub',
          allowedChannelIds: [publicChannelId],
          accessMode: 'ROLE_QUOTAS',
          tokenQuotaMode: 'LIMITED',
          dailyGuildTokenLimit: 100,
          dailyGuildImageLimit: 2,
          maxOutputTokens: 50,
          maxRunTokens: 500,
          imageEnabled: true,
          imageBaseUrl: 'https://api.example.com/v1',
          imageModel: 'gpt-image-1',
          imageCredentialSource: 'CHAT',
          policyRevision: 1n,
          roleRules: {
            create: [
              {
                roleId: publicRoleId,
                chatEnabled: true,
                imageEnabled: true,
                dailyTokenLimit: 100,
                dailyImageLimit: 2,
              },
            ],
          },
        },
      });

      await client.discordAgentSettings.create({
        data: {
          guildId,
          profile: 'ADMIN',
          enabled: true,
          provider: 'openai-compatible',
          model: 'gpt-4.1',
          baseUrl: 'https://api.example.com/v1',
          encryptedApiKey: 'enc:adm',
          allowedChannelIds: [adminChannelId],
          accessMode: 'ROLE_QUOTAS',
          tokenQuotaMode: 'UNLIMITED',
          dailyGuildTokenLimit: null,
          dailyGuildImageLimit: 1,
          maxOutputTokens: 1024,
          maxRunTokens: null,
          imageEnabled: true,
          imageBaseUrl: 'https://api.example.com/v1',
          imageModel: 'gpt-image-1',
          imageCredentialSource: 'CHAT',
          policyRevision: 1n,
          roleRules: {
            create: [
              {
                roleId: adminRoleId,
                chatEnabled: true,
                imageEnabled: true,
                dailyTokenLimit: null,
                dailyImageLimit: 1,
              },
            ],
          },
        },
      });

      const access = new AgentAccessService(client as PrismaService);
      access.setClient(createDiscordClientStub());
      queryService = new AgentQuotaQueryService(client as PrismaService, access);
    });

    it('charges PUBLIC chat only to PUBLIC while ADMIN exceeds former caps without local quota failure and enforces finite ADMIN image quotas', async () => {
      // PUBLIC chat reservation and settlement
      const pubLease = await quotaServices[0].acquireLease(guildId, memberUserId, randomUUID());
      const pubAttempt = await quotaServices[0].reserve({
        attemptId: randomUUID(),
        lease: pubLease,
        profile: 'PUBLIC',
        capability: 'CHAT',
        policyRevision: 1n,
        tokenPolicy: { mode: 'LIMITED', guildLimit: 100, memberLimit: 100, runTokenLimit: 500 },
        guildLimit: 100,
        memberLimit: 100,
        tokens: 70,
        images: 0,
        runTokensUsed: 0,
        runTokenLimit: 500,
      });
      await quotaServices[0].markDispatched(pubAttempt.id, pubLease);
      await quotaServices[0].finalize(pubAttempt.id, { kind: 'REPORTED', tokens: 30, code: 'OK' });
      await quotaServices[0].releaseLease(pubLease);

      // ADMIN chat exceeds 1,000,000,000 daily tokens and 262,144 run tokens across successive calls
      const admLease1 = await quotaServices[0].acquireLease(guildId, adminUserId, randomUUID());
      const admAttempt1 = await quotaServices[0].reserve({
        attemptId: randomUUID(),
        lease: admLease1,
        profile: 'ADMIN',
        capability: 'CHAT',
        policyRevision: 1n,
        tokenPolicy: { mode: 'UNLIMITED', guildLimit: null, memberLimit: null, runTokenLimit: null },
        guildLimit: null,
        memberLimit: null,
        tokens: 600000000,
        images: 0,
        runTokensUsed: 300000,
        runTokenLimit: null,
      });
      await quotaServices[0].markDispatched(admAttempt1.id, admLease1);
      await quotaServices[0].finalize(admAttempt1.id, { kind: 'REPORTED', tokens: 1000000001, code: 'OK' });
      await quotaServices[0].releaseLease(admLease1);

      const admLease2 = await quotaServices[0].acquireLease(guildId, adminUserId, randomUUID());
      const admAttempt2 = await quotaServices[0].reserve({
        attemptId: randomUUID(),
        lease: admLease2,
        profile: 'ADMIN',
        capability: 'CHAT',
        policyRevision: 1n,
        tokenPolicy: { mode: 'UNLIMITED', guildLimit: null, memberLimit: null, runTokenLimit: null },
        guildLimit: null,
        memberLimit: null,
        tokens: 500000,
        images: 0,
        runTokensUsed: 1000000001,
        runTokenLimit: null,
      });
      await quotaServices[0].markDispatched(admAttempt2.id, admLease2);
      await quotaServices[0].finalize(admAttempt2.id, { kind: 'ESTIMATED', tokens: 500000, code: 'NO_USAGE' });
      await quotaServices[0].releaseLease(admLease2);

      // Verify separate PUBLIC vs ADMIN ledgers and source-separated amounts
      const publicLedger = await queryService.getToday({ guildId, profile: 'PUBLIC' });
      const adminLedger = await queryService.getToday({ guildId, profile: 'ADMIN' });

      expect(publicLedger.guild.tokens).toMatchObject({ committed: '30', reserved: '0', limit: 100, remaining: 70 });
      expect(publicLedger.guild.usageSources).toEqual({ REPORTED: 1 });
      expect(publicLedger.guild.usageSourceAmounts).toEqual({ REPORTED: '30' });

      expect(adminLedger.guild.tokens).toMatchObject({
        committed: '1000500001',
        reserved: '0',
        limit: null,
        remaining: null,
        unlimited: true,
      });
      expect(adminLedger.guild.usageSources).toEqual({ REPORTED: 1, ESTIMATED: 1 });
      expect(adminLedger.guild.usageSourceAmounts).toEqual({ REPORTED: '1000000001', ESTIMATED: '500000' });

      // Exercise profile-specific images, cross-profile duplicate request keys, and ADMIN finite image cap (1/day)
      const access = new AgentAccessService(db.clients[0] as PrismaService);
      access.setClient(createDiscordClientStub());
      const settingsSvc = { decryptApiKey: (v: string) => v.replace('enc:', '') } as unknown as AiAgentSettingsService;
      const imageProvider = new OpenAiImageProvider({
        request: async (req: any) => {
          await req.beforeSend?.();
          return {
            status: 200,
            contentType: 'application/json',
            body: Buffer.from(JSON.stringify({ data: [{ b64_json: png1024.toString('base64') }] })),
          };
        },
      } as any);
      const imageService = new AgentImageService(access, quotaServices[0], imageProvider, settingsSvc);

      const pubImg = await imageService.handle({
        guildId,
        profile: 'PUBLIC',
        channelId: publicChannelId,
        userId: memberUserId,
        messageId: 'same-msg-id',
        prompt: 'gunung',
        attachmentLimit: 8388608,
        canAttach: true,
      });
      expect(pubImg.files).toHaveLength(1);

      const admImg1 = await imageService.handle({
        guildId,
        profile: 'ADMIN',
        channelId: adminChannelId,
        userId: adminUserId,
        messageId: 'same-msg-id',
        prompt: 'grafik',
        attachmentLimit: 8388608,
        canAttach: true,
      });
      expect(admImg1.files).toHaveLength(1);

      const admImg2 = await imageService.handle({
        guildId,
        profile: 'ADMIN',
        channelId: adminChannelId,
        userId: adminUserId,
        messageId: 'second-admin-img',
        prompt: 'grafik kedua',
        attachmentLimit: 8388608,
        canAttach: true,
      });
      expect(admImg2.files).toBeUndefined();
      expect(admImg2.content).toContain('Kuota gambar harian');
    });
  });
});
