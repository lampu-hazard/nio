import { afterEach, describe, expect, it } from '@jest/globals';
import { createQuotaTestDatabase } from './agent-quota-db';

// The fixture never uses application DATABASE_URL, even when no test DB is set.
describe('populated agent profile migration', () => {
  let db: Awaited<ReturnType<typeof createQuotaTestDatabase>>;
  afterEach(async () => { await db?.close(); });

  it('preserves legacy accounting in disabled ADMIN and creates clean PUBLIC profiles', async () => {
    db = await createQuotaTestDatabase({ beforeMigration: '20261104020000_agent_profiles' });
    const client = db.clients[0];
    for (const [guildId, mode] of [['role-guild', 'ROLE_QUOTAS'], ['legacy-guild', 'LEGACY_USERS']]) {
      await client.$executeRawUnsafe(`INSERT INTO "DiscordAgentSettings"
        ("guildId", "enabled", "accessMode", "encryptedApiKey", "userTokenRules", "allowedUserIds", "updatedAt")
        VALUES ($1, true, $2, 'encrypted-old-key', '[{"userId":"12345","dailyTokenLimit":null}]', ARRAY['12345'], NOW())`, guildId, mode);
      await client.$executeRawUnsafe(`INSERT INTO "AgentRoleRule"
        ("guildId", "roleId", "chatEnabled", "imageEnabled", "dailyTokenLimit", "dailyImageLimit")
        VALUES ($1, '12345', true, true, 9000, 3)`, guildId);
    }
    await client.$executeRawUnsafe(`INSERT INTO "AgentQuotaBucket"
      ("guildId", "periodStart", "subject", "committedTokens", "reservedTokens")
      VALUES ('role-guild', '2026-11-04T00:00:00Z', 'GUILD', 30, 70)`);
    await client.$executeRawUnsafe(`INSERT INTO "AgentMemberLease"
      ("guildId", "userId", "requestId", "fence", "expiresAt")
      VALUES ('role-guild', '12345', 'old-request', 9, NOW() + INTERVAL '1 hour')`);
    await client.$executeRawUnsafe(`INSERT INTO "AgentQuotaAttempt"
      ("id", "guildId", "userId", "requestId", "capability", "policyRevision", "fence", "periodStart", "reservedTokens", "expiresAt")
      VALUES ('old-attempt', 'role-guild', '12345', 'old-request', 'CHAT', 0, 9, '2026-11-04T00:00:00Z', 70, NOW() + INTERVAL '1 hour')`);
    await client.$executeRawUnsafe(`INSERT INTO "AgentActionProposal"
      ("id", "guildId", "channelId", "requestedById", "actionType", "payload", "expiresAt", "updatedAt")
      VALUES ('old-proposal', 'role-guild', 'channel', '12345', 'KICK', '{}', NOW() + INTERVAL '1 hour', NOW())`);
    await client.$executeRawUnsafe(`INSERT INTO "AgentRun" ("id", "guildId", "channelId", "userId")
      VALUES ('old-run', 'role-guild', 'channel', '12345')`);
    await client.$executeRawUnsafe(`INSERT INTO "AgentInteractionLog"
      ("id", "guildId", "channelId", "userId", "prompt", "status", "totalTokens")
      VALUES ('old-log', 'role-guild', 'channel', '12345', 'old prompt', 'SUCCESS', 30)`);

    await db.migrateRemaining();
    const settings = await client.$queryRawUnsafe<any[]>('SELECT * FROM "DiscordAgentSettings" ORDER BY "guildId", "profile"');
    expect(settings).toHaveLength(4);
    for (const guildId of ['role-guild', 'legacy-guild']) {
      const admin = settings.find((s) => s.guildId === guildId && s.profile === 'ADMIN');
      const publicProfile = settings.find((s) => s.guildId === guildId && s.profile === 'PUBLIC');
      expect(admin).toMatchObject({ enabled: false, tokenQuotaMode: 'UNLIMITED', dailyGuildTokenLimit: null,
        maxRunTokens: null, encryptedApiKey: 'encrypted-old-key', accessMode: 'ROLE_QUOTAS', userTokenRules: [] });
      expect(admin.migrationAudit).toMatchObject({ dailyGuildTokenLimit: 1000000, maxRunTokens: 32768,
        userTokenRules: [{ userId: '12345', dailyTokenLimit: null }], allowedUserIds: ['12345'] });
      expect(publicProfile).toMatchObject({ enabled: false, tokenQuotaMode: 'LIMITED', dailyGuildTokenLimit: 1000000,
        encryptedApiKey: null, allowedToolIds: [], allowedChannelIds: [], userTokenRules: [] });
    }
    expect(await client.$queryRawUnsafe('SELECT "profile", "dailyTokenLimit", "dailyImageLimit", "imageEnabled" FROM "AgentRoleRule"'))
      .toEqual(expect.arrayContaining([{ profile: 'ADMIN', dailyTokenLimit: null, dailyImageLimit: 3, imageEnabled: true }]));
    expect(await client.$queryRawUnsafe('SELECT "id", "profile", "reservedTokens", "tokenCountSource" FROM "AgentQuotaAttempt"'))
      .toEqual([{ id: 'old-attempt', profile: 'ADMIN', reservedTokens: 70n, tokenCountSource: null }]);
    expect(await client.$queryRawUnsafe('SELECT "fence" FROM "AgentMemberLease"')).toEqual([{ fence: 9n }]);
    expect(await client.$queryRawUnsafe('SELECT "profile", "status", "originToolId" FROM "AgentActionProposal"'))
      .toEqual([{ profile: 'ADMIN', status: 'CANCELLED', originToolId: null }]);
    expect(await client.$queryRawUnsafe('SELECT "profile" FROM "AgentRun"')).toEqual([{ profile: 'ADMIN' }]);
    expect(await client.$queryRawUnsafe('SELECT "profile", "totalTokens" FROM "AgentInteractionLog"'))
      .toEqual([{ profile: 'ADMIN', totalTokens: 30 }]);
    expect(await client.$queryRawUnsafe('SELECT "profile", "committedTokens", "reservedTokens" FROM "AgentQuotaBucket"'))
      .toEqual([{ profile: 'ADMIN', committedTokens: 30n, reservedTokens: 70n }]);
    await client.$executeRawUnsafe(`INSERT INTO "AgentRoleRule" ("guildId", "profile", "roleId", "dailyTokenLimit")
      VALUES ('role-guild', 'PUBLIC', '12345', 0)`);
    await client.$executeRawUnsafe(`INSERT INTO "AgentQuotaBucket" ("guildId", "profile", "periodStart", "subject")
      VALUES ('role-guild', 'PUBLIC', '2026-11-04T00:00:00Z', 'GUILD')`);
    await expect(client.$executeRawUnsafe(`UPDATE "DiscordAgentSettings" SET "dailyGuildTokenLimit" = 100 WHERE "profile" = 'ADMIN'`)).rejects.toThrow();
    await expect(client.$executeRawUnsafe(`UPDATE "DiscordAgentSettings" SET "maxRunTokens" = NULL WHERE "profile" = 'PUBLIC'`)).rejects.toThrow();
    await expect(client.$executeRawUnsafe(`INSERT INTO "AgentQuotaBucket" ("guildId", "periodStart", "subject")
      VALUES ('role-guild', '2026-11-05T00:00:00Z', 'GUILD')`)).rejects.toThrow();
  }, 180000);
});
