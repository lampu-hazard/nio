ALTER TABLE "GuildSettings"
  ADD COLUMN "voiceXpEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "voiceXpPerMinute" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "voiceNotificationChannelId" TEXT;

CREATE TABLE "VoiceXpReward" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "roleId" TEXT NOT NULL,
  CONSTRAINT "VoiceXpReward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VoiceXpBalance" (
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "xp" BIGINT NOT NULL DEFAULT 0,
  "remainder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "VoiceXpBalance_pkey" PRIMARY KEY ("guildId", "userId"),
  CONSTRAINT "VoiceXpBalance_xp_check" CHECK ("xp" >= 0),
  CONSTRAINT "VoiceXpBalance_remainder_check" CHECK ("remainder" >= 0 AND "remainder" < 60000)
);

CREATE UNIQUE INDEX "VoiceXpReward_guildId_level_key" ON "VoiceXpReward"("guildId", "level");
CREATE UNIQUE INDEX "VoiceXpReward_guildId_roleId_key" ON "VoiceXpReward"("guildId", "roleId");
ALTER TABLE "VoiceXpReward" ADD CONSTRAINT "VoiceXpReward_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceXpBalance" ADD CONSTRAINT "VoiceXpBalance_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
