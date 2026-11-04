ALTER TABLE "DiscordAgentSettings"
  ADD COLUMN "accessMode" TEXT NOT NULL DEFAULT 'LEGACY_USERS',
  ADD COLUMN "policyRevision" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "dailyGuildTokenLimit" INTEGER NOT NULL DEFAULT 1000000,
  ADD COLUMN "dailyGuildImageLimit" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "maxOutputTokens" INTEGER NOT NULL DEFAULT 2048,
  ADD COLUMN "maxRunTokens" INTEGER NOT NULL DEFAULT 32768,
  ADD COLUMN "imageEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "imageBaseUrl" TEXT,
  ADD COLUMN "imageModel" TEXT,
  ADD COLUMN "imageCredentialSource" TEXT NOT NULL DEFAULT 'SEPARATE',
  ADD COLUMN "encryptedImageApiKey" TEXT,
  ADD CONSTRAINT "agent_settings_limits" CHECK (
    "accessMode" IN ('LEGACY_USERS', 'ROLE_QUOTAS') AND "policyRevision" >= 0
    AND "dailyGuildTokenLimit" BETWEEN 1 AND 1000000000
    AND "dailyGuildImageLimit" BETWEEN 0 AND 10000
    AND "maxOutputTokens" BETWEEN 128 AND 8192
    AND "maxRunTokens" BETWEEN 1024 AND 262144 AND "maxRunTokens" > "maxOutputTokens"
    AND "imageCredentialSource" IN ('SEPARATE', 'CHAT')
    AND (NOT "imageEnabled" OR "accessMode" = 'ROLE_QUOTAS')
  );

CREATE TABLE "AgentRoleRule" (
  "guildId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "chatEnabled" BOOLEAN NOT NULL DEFAULT false,
  "imageEnabled" BOOLEAN NOT NULL DEFAULT false,
  "dailyTokenLimit" INTEGER NOT NULL DEFAULT 0,
  "dailyImageLimit" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("guildId", "roleId"),
  CONSTRAINT "AgentRoleRule_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "DiscordAgentSettings"("guildId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_role_limits" CHECK (
    "dailyTokenLimit" BETWEEN 0 AND 100000000 AND "dailyImageLimit" BETWEEN 0 AND 1000
    AND (NOT "chatEnabled" OR "dailyTokenLimit" > 0) AND (NOT "imageEnabled" OR "dailyImageLimit" > 0)
  )
);

CREATE TABLE "AgentQuotaBucket" (
  "guildId" TEXT NOT NULL,
  "periodStart" TIMESTAMPTZ(3) NOT NULL,
  "subject" TEXT NOT NULL,
  "committedTokens" BIGINT NOT NULL DEFAULT 0,
  "reservedTokens" BIGINT NOT NULL DEFAULT 0,
  "committedImages" BIGINT NOT NULL DEFAULT 0,
  "reservedImages" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("guildId", "periodStart", "subject"),
  CONSTRAINT "agent_bucket_nonnegative" CHECK (
    "committedTokens" >= 0 AND "reservedTokens" >= 0 AND "committedImages" >= 0 AND "reservedImages" >= 0
  )
);
CREATE INDEX "AgentQuotaBucket_periodStart_idx" ON "AgentQuotaBucket"("periodStart");

CREATE TABLE "AgentQuotaAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestKey" TEXT,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "runId" TEXT,
  "capability" TEXT NOT NULL,
  "policyRevision" BIGINT NOT NULL,
  "fence" BIGINT NOT NULL,
  "periodStart" TIMESTAMPTZ(3) NOT NULL,
  "reservedTokens" BIGINT NOT NULL DEFAULT 0,
  "reservedImages" BIGINT NOT NULL DEFAULT 0,
  "chargedTokens" BIGINT NOT NULL DEFAULT 0,
  "chargedImages" BIGINT NOT NULL DEFAULT 0,
  "state" TEXT NOT NULL DEFAULT 'RESERVED',
  "usageSource" TEXT,
  "outcomeCode" TEXT,
  "overrun" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "dispatchedAt" TIMESTAMPTZ(3),
  "finalizedAt" TIMESTAMPTZ(3),
  CONSTRAINT "agent_attempt_valid" CHECK (
    "capability" IN ('CHAT', 'IMAGE') AND "state" IN ('RESERVED', 'DISPATCHED', 'FINALIZED')
    AND "policyRevision" >= 0 AND "fence" > 0
    AND "reservedTokens" >= 0 AND "reservedImages" >= 0 AND "chargedTokens" >= 0 AND "chargedImages" >= 0
    AND ("usageSource" IS NULL OR "usageSource" IN ('REPORTED', 'ESTIMATED', 'UNCERTAIN', 'REJECTED', 'LOCAL_FAILURE'))
  )
);
CREATE UNIQUE INDEX "AgentQuotaAttempt_requestKey_key" ON "AgentQuotaAttempt"("requestKey");
CREATE INDEX "AgentQuotaAttempt_state_expiresAt_idx" ON "AgentQuotaAttempt"("state", "expiresAt");
CREATE INDEX "AgentQuotaAttempt_guildId_periodStart_userId_idx" ON "AgentQuotaAttempt"("guildId", "periodStart", "userId");
CREATE INDEX "AgentQuotaAttempt_finalizedAt_idx" ON "AgentQuotaAttempt"("finalizedAt");

CREATE TABLE "AgentMemberLease" (
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "fence" BIGINT NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY ("guildId", "userId"),
  CONSTRAINT "agent_lease_fence" CHECK ("fence" > 0)
);
CREATE INDEX "AgentMemberLease_expiresAt_idx" ON "AgentMemberLease"("expiresAt");
