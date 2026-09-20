-- Schema additions that historically used `prisma db push`.
ALTER TABLE "GuildSettings" ADD COLUMN "messageDeleteLogChannelId" TEXT;

CREATE TABLE "DiscordAgentSettings" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL DEFAULT 'gemini',
    "model" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "allowedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "systemPrompt" TEXT,
    "messageRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordAgentSettings_pkey" PRIMARY KEY ("guildId")
);

CREATE TABLE "AgentInteractionLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "prompt" TEXT NOT NULL,
    "response" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AgentInteractionLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordMessageLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "embeds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "DiscordMessageLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentActionProposal" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "targetUserId" TEXT,
    "actionType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentActionProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserNote" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VoiceSession" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceSession_pkey" PRIMARY KEY ("id")
);

CREATE TYPE "PluginType" AS ENUM ('FREE', 'PREMIUM');
CREATE TYPE "GuildPluginStatus" AS ENUM ('INSTALLED', 'DISABLED', 'SUSPENDED', 'UNAVAILABLE');
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'PENDING');

CREATE TABLE "PluginCatalog" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "PluginType" NOT NULL DEFAULT 'FREE',
    "price" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PluginCatalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuildPlugin" (
    "guildId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "status" "GuildPluginStatus" NOT NULL DEFAULT 'INSTALLED',
    "settings" JSONB,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GuildPlugin_pkey" PRIMARY KEY ("guildId", "pluginId")
);

CREATE TABLE "GuildEntitlement" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "status" "EntitlementStatus" NOT NULL DEFAULT 'PENDING',
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GuildEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuildCommandSync" (
    "guildId" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GuildCommandSync_pkey" PRIMARY KEY ("guildId")
);

CREATE INDEX "AgentInteractionLog_guildId_createdAt_idx" ON "AgentInteractionLog"("guildId", "createdAt");
CREATE INDEX "AgentInteractionLog_guildId_userId_createdAt_idx" ON "AgentInteractionLog"("guildId", "userId", "createdAt");
CREATE INDEX "AgentInteractionLog_guildId_targetUserId_createdAt_idx" ON "AgentInteractionLog"("guildId", "targetUserId", "createdAt");
CREATE INDEX "DiscordMessageLog_guildId_authorId_createdAt_idx" ON "DiscordMessageLog"("guildId", "authorId", "createdAt");
CREATE INDEX "DiscordMessageLog_guildId_channelId_createdAt_idx" ON "DiscordMessageLog"("guildId", "channelId", "createdAt");
CREATE INDEX "DiscordMessageLog_guildId_createdAt_idx" ON "DiscordMessageLog"("guildId", "createdAt");
CREATE INDEX "AgentActionProposal_guildId_requestedById_status_idx" ON "AgentActionProposal"("guildId", "requestedById", "status");
CREATE INDEX "AgentActionProposal_guildId_targetUserId_createdAt_idx" ON "AgentActionProposal"("guildId", "targetUserId", "createdAt");
CREATE INDEX "UserNote_guildId_idx" ON "UserNote"("guildId");
CREATE INDEX "UserNote_userId_idx" ON "UserNote"("userId");
CREATE INDEX "VoiceSession_guildId_idx" ON "VoiceSession"("guildId");
CREATE INDEX "VoiceSession_userId_idx" ON "VoiceSession"("userId");
CREATE INDEX "VoiceSession_joinedAt_idx" ON "VoiceSession"("joinedAt");
CREATE INDEX "PluginCatalog_active_idx" ON "PluginCatalog"("active");
CREATE INDEX "GuildPlugin_pluginId_status_idx" ON "GuildPlugin"("pluginId", "status");
CREATE INDEX "GuildEntitlement_guildId_pluginId_status_idx" ON "GuildEntitlement"("guildId", "pluginId", "status");
CREATE UNIQUE INDEX "GuildEntitlement_provider_externalId_key" ON "GuildEntitlement"("provider", "externalId");

ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceSession" ADD CONSTRAINT "VoiceSession_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuildPlugin" ADD CONSTRAINT "GuildPlugin_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuildPlugin" ADD CONSTRAINT "GuildPlugin_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "PluginCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuildEntitlement" ADD CONSTRAINT "GuildEntitlement_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuildEntitlement" ADD CONSTRAINT "GuildEntitlement_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "PluginCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuildCommandSync" ADD CONSTRAINT "GuildCommandSync_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
