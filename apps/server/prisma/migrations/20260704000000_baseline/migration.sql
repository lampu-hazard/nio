-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PanelType" AS ENUM ('SELF_ROLE', 'RULES', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "PanelMode" AS ENUM ('BUTTONS', 'MENU');

-- CreateEnum
CREATE TYPE "PanelStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PanelStyle" AS ENUM ('PREMIUM', 'MINIMAL', 'COLORFUL', 'NEON');

-- CreateEnum
CREATE TYPE "ButtonStyle" AS ENUM ('PRIMARY', 'SECONDARY', 'SUCCESS', 'DANGER');

-- CreateEnum
CREATE TYPE "RoleAction" AS ENUM ('ADD', 'REMOVE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "globalName" TEXT,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildSettings" (
    "guildId" TEXT NOT NULL,
    "logChannelId" TEXT,
    "defaultStyle" TEXT NOT NULL DEFAULT 'PREMIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stickerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slowmodeChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "slowmodeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slowmodeIntervalBusy" INTEGER NOT NULL DEFAULT 10,
    "slowmodeIntervalQuiet" INTEGER NOT NULL DEFAULT 0,
    "slowmodeIntervalNormal" INTEGER NOT NULL DEFAULT 5,
    "anomalyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "phishingDetectionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "contentAnomalyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "userAnomalyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "guildBaselineEnabled" BOOLEAN NOT NULL DEFAULT true,
    "anomalyEnforcementMode" TEXT NOT NULL DEFAULT 'AUDIT_ONLY',
    "warnLimitEnabled" BOOLEAN NOT NULL DEFAULT false,
    "warnLimitThreshold" INTEGER NOT NULL DEFAULT 3,
    "warnTimeoutDurationMin" INTEGER NOT NULL DEFAULT 60,
    "warnExpiryDays" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "GuildSettings_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "Panel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "channelId" TEXT,
    "messageId" TEXT,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "accentText" TEXT,
    "description" TEXT,
    "type" "PanelType" NOT NULL DEFAULT 'SELF_ROLE',
    "mode" "PanelMode" NOT NULL DEFAULT 'BUTTONS',
    "style" "PanelStyle" NOT NULL DEFAULT 'PREMIUM',
    "color" TEXT NOT NULL DEFAULT '#5865F2',
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "maxRoles" INTEGER NOT NULL DEFAULT 0,
    "requireRoleId" TEXT,
    "status" "PanelStatus" NOT NULL DEFAULT 'DRAFT',
    "lastPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Panel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanelRole" (
    "id" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "emoji" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "buttonStyle" "ButtonStyle" NOT NULL DEFAULT 'SECONDARY',
    "position" INTEGER NOT NULL,

    CONSTRAINT "PanelRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "action" "RoleAction" NOT NULL,
    "panelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "panelId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sticker" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sticker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sid" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warning" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PanelRole_panelId_roleId_key" ON "PanelRole"("panelId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Sticker_guildId_name_key" ON "Sticker"("guildId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sid_key" ON "Session"("sid");

-- CreateIndex
CREATE INDEX "Warning_guildId_idx" ON "Warning"("guildId");

-- CreateIndex
CREATE INDEX "Warning_userId_idx" ON "Warning"("userId");

-- AddForeignKey
ALTER TABLE "GuildSettings" ADD CONSTRAINT "GuildSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Panel" ADD CONSTRAINT "Panel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Panel" ADD CONSTRAINT "Panel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelRole" ADD CONSTRAINT "PanelRole_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "Panel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleLog" ADD CONSTRAINT "RoleLog_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "Panel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "Panel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warning" ADD CONSTRAINT "Warning_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

