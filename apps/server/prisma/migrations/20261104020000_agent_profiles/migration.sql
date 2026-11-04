-- Drain old workers before applying: mixed-version settings and ledger writes are unsupported.
BEGIN;

ALTER TABLE "DiscordAgentSettings"
  ADD COLUMN "profile" TEXT NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN "tokenQuotaMode" TEXT NOT NULL DEFAULT 'UNLIMITED',
  ADD COLUMN "allowedToolIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "migrationAudit" JSONB,
  DROP CONSTRAINT "agent_settings_limits";
ALTER TABLE "AgentRoleRule"
  ADD COLUMN "profile" TEXT NOT NULL DEFAULT 'ADMIN',
  DROP CONSTRAINT "AgentRoleRule_guildId_fkey",
  DROP CONSTRAINT "agent_role_limits";

UPDATE "DiscordAgentSettings" s SET "migrationAudit" = jsonb_build_object(
  'version', 1, 'accessMode', s."accessMode", 'enabled', s."enabled",
  'dailyGuildTokenLimit', s."dailyGuildTokenLimit", 'maxRunTokens', s."maxRunTokens",
  'userTokenRules', s."userTokenRules", 'allowedUserIds', s."allowedUserIds",
  'roleTokenRules', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'roleId', r."roleId", 'dailyTokenLimit', r."dailyTokenLimit"))
    FROM "AgentRoleRule" r WHERE r."guildId" = s."guildId"), '[]'::jsonb)
);
ALTER TABLE "DiscordAgentSettings"
  ALTER COLUMN "dailyGuildTokenLimit" DROP NOT NULL,
  ALTER COLUMN "dailyGuildTokenLimit" DROP DEFAULT,
  ALTER COLUMN "maxRunTokens" DROP NOT NULL,
  ALTER COLUMN "maxRunTokens" DROP DEFAULT;
ALTER TABLE "AgentRoleRule" ALTER COLUMN "dailyTokenLimit" DROP NOT NULL,
  ALTER COLUMN "dailyTokenLimit" DROP DEFAULT;
UPDATE "DiscordAgentSettings" SET "enabled" = false, "accessMode" = 'ROLE_QUOTAS',
  "dailyGuildTokenLimit" = NULL, "maxRunTokens" = NULL, "userTokenRules" = '[]'::jsonb,
  "allowedUserIds" = ARRAY[]::TEXT[];
UPDATE "AgentRoleRule" SET "dailyTokenLimit" = NULL;

ALTER TABLE "DiscordAgentSettings" DROP CONSTRAINT "DiscordAgentSettings_pkey",
  ADD PRIMARY KEY ("guildId", "profile");
ALTER TABLE "AgentRoleRule" DROP CONSTRAINT "AgentRoleRule_pkey",
  ADD PRIMARY KEY ("guildId", "profile", "roleId"),
  ADD CONSTRAINT "AgentRoleRule_guildId_profile_fkey" FOREIGN KEY ("guildId", "profile")
    REFERENCES "DiscordAgentSettings"("guildId", "profile") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "DiscordAgentSettings" ("guildId", "profile", "tokenQuotaMode", "accessMode", "dailyGuildTokenLimit", "maxRunTokens", "updatedAt")
  SELECT "guildId", 'PUBLIC', 'LIMITED', 'ROLE_QUOTAS', 1000000, 32768, CURRENT_TIMESTAMP
  FROM "DiscordAgentSettings" WHERE "profile" = 'ADMIN';

ALTER TABLE "DiscordAgentSettings"
  ALTER COLUMN "profile" DROP DEFAULT,
  ALTER COLUMN "tokenQuotaMode" DROP DEFAULT,
  ALTER COLUMN "accessMode" SET DEFAULT 'ROLE_QUOTAS',
  ADD CONSTRAINT "agent_settings_limits" CHECK (
    "profile" IN ('PUBLIC', 'ADMIN') AND "accessMode" = 'ROLE_QUOTAS' AND "policyRevision" >= 0
    AND "dailyGuildImageLimit" BETWEEN 0 AND 10000 AND "maxOutputTokens" BETWEEN 128 AND 8192
    AND "imageCredentialSource" IN ('SEPARATE', 'CHAT')
    AND (("profile" = 'ADMIN' AND "tokenQuotaMode" = 'UNLIMITED'
      AND "dailyGuildTokenLimit" IS NULL AND "maxRunTokens" IS NULL AND "userTokenRules" = '[]'::jsonb)
      OR ("profile" = 'PUBLIC' AND "tokenQuotaMode" = 'LIMITED'
      AND "dailyGuildTokenLimit" IS NOT NULL AND "dailyGuildTokenLimit" BETWEEN 1 AND 1000000000
      AND "maxRunTokens" IS NOT NULL AND "maxRunTokens" BETWEEN 1024 AND 262144 AND "maxRunTokens" >= "maxOutputTokens"))
  );
ALTER TABLE "AgentRoleRule" ALTER COLUMN "profile" DROP DEFAULT,
  ADD CONSTRAINT "agent_role_limits" CHECK (
    "profile" IN ('PUBLIC', 'ADMIN') AND "dailyImageLimit" BETWEEN 0 AND 1000
    AND (NOT "imageEnabled" OR "dailyImageLimit" > 0)
    AND (("profile" = 'ADMIN' AND "dailyTokenLimit" IS NULL)
      OR ("profile" = 'PUBLIC' AND "dailyTokenLimit" IS NOT NULL
      AND "dailyTokenLimit" BETWEEN 0 AND 100000000 AND (NOT "chatEnabled" OR "dailyTokenLimit" > 0)))
  );

ALTER TABLE "AgentQuotaBucket" ADD COLUMN "profile" TEXT NOT NULL DEFAULT 'ADMIN';
ALTER TABLE "AgentQuotaBucket" DROP CONSTRAINT "AgentQuotaBucket_pkey",
  ADD PRIMARY KEY ("guildId", "profile", "periodStart", "subject"),
  ALTER COLUMN "profile" DROP DEFAULT,
  ADD CONSTRAINT "agent_bucket_profile" CHECK ("profile" IN ('PUBLIC', 'ADMIN'));

ALTER TABLE "AgentQuotaAttempt" ADD COLUMN "profile" TEXT NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN "tokenCountSource" TEXT, ADD COLUMN "tokenCounterVersion" TEXT, ADD COLUMN "inputTokenEstimate" BIGINT;
ALTER TABLE "AgentQuotaAttempt" ALTER COLUMN "profile" DROP DEFAULT,
  ADD CONSTRAINT "agent_attempt_profile" CHECK ("profile" IN ('PUBLIC', 'ADMIN')),
  ADD CONSTRAINT "agent_attempt_count" CHECK (
    ("tokenCountSource" IS NULL OR "tokenCountSource" IN ('PROVIDER_COUNT', 'MODEL_TOKENIZER', 'CONSERVATIVE_FALLBACK'))
    AND ("inputTokenEstimate" IS NULL OR "inputTokenEstimate" >= 0));
DROP INDEX "AgentQuotaAttempt_guildId_periodStart_userId_idx";
CREATE INDEX "AgentQuotaAttempt_guildId_profile_periodStart_userId_idx" ON "AgentQuotaAttempt"("guildId", "profile", "periodStart", "userId");

ALTER TABLE "AgentRun" ADD COLUMN "profile" TEXT NOT NULL DEFAULT 'ADMIN';
ALTER TABLE "AgentRun" ALTER COLUMN "profile" DROP DEFAULT,
  ADD CONSTRAINT "agent_run_profile" CHECK ("profile" IN ('PUBLIC', 'ADMIN'));
DROP INDEX "AgentRun_guildId_startedAt_idx";
DROP INDEX "AgentRun_guildId_userId_startedAt_idx";
CREATE INDEX "AgentRun_guildId_profile_startedAt_idx" ON "AgentRun"("guildId", "profile", "startedAt");
CREATE INDEX "AgentRun_guildId_profile_userId_startedAt_idx" ON "AgentRun"("guildId", "profile", "userId", "startedAt");

ALTER TABLE "AgentInteractionLog" ADD COLUMN "profile" TEXT NOT NULL DEFAULT 'ADMIN';
ALTER TABLE "AgentInteractionLog" ALTER COLUMN "profile" DROP DEFAULT,
  ADD CONSTRAINT "agent_log_profile" CHECK ("profile" IN ('PUBLIC', 'ADMIN'));
DROP INDEX "AgentInteractionLog_guildId_createdAt_idx";
DROP INDEX "AgentInteractionLog_guildId_userId_createdAt_idx";
DROP INDEX "AgentInteractionLog_guildId_targetUserId_createdAt_idx";
CREATE INDEX "AgentInteractionLog_guildId_profile_createdAt_idx" ON "AgentInteractionLog"("guildId", "profile", "createdAt");
CREATE INDEX "AgentInteractionLog_guildId_profile_userId_createdAt_idx" ON "AgentInteractionLog"("guildId", "profile", "userId", "createdAt");
CREATE INDEX "AgentInteractionLog_guildId_profile_targetUserId_createdAt_idx" ON "AgentInteractionLog"("guildId", "profile", "targetUserId", "createdAt");

ALTER TABLE "AgentActionProposal" ADD COLUMN "profile" TEXT NOT NULL DEFAULT 'ADMIN', ADD COLUMN "originToolId" TEXT;
UPDATE "AgentActionProposal" SET "status" = 'CANCELLED' WHERE "status" = 'PENDING';
ALTER TABLE "AgentActionProposal" ALTER COLUMN "profile" DROP DEFAULT,
  ADD CONSTRAINT "agent_proposal_profile" CHECK ("profile" IN ('PUBLIC', 'ADMIN'));
DROP INDEX "AgentActionProposal_guildId_requestedById_status_idx";
DROP INDEX "AgentActionProposal_guildId_targetUserId_createdAt_idx";
CREATE INDEX "AgentActionProposal_guildId_profile_requestedById_status_idx" ON "AgentActionProposal"("guildId", "profile", "requestedById", "status");
CREATE INDEX "AgentActionProposal_guildId_profile_targetUserId_createdAt_idx" ON "AgentActionProposal"("guildId", "profile", "targetUserId", "createdAt");

COMMIT;
