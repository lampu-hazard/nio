ALTER TABLE "GuildSettings"
  ADD COLUMN "hallOfFameEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hallOfFameChannelId" TEXT,
  ADD COLUMN "hallOfFameThreshold" INTEGER NOT NULL DEFAULT 3;

CREATE TABLE "HallOfFameEntry" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "sourceChannelId" TEXT NOT NULL,
  "sourceMessageId" TEXT NOT NULL,
  "mirrorChannelId" TEXT NOT NULL,
  "mirrorMessageId" TEXT NOT NULL,
  "starCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HallOfFameEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HallOfFameEntry_mirrorMessageId_key"
  ON "HallOfFameEntry"("mirrorMessageId");
CREATE UNIQUE INDEX "HallOfFameEntry_guildId_sourceChannelId_sourceMessageId_key"
  ON "HallOfFameEntry"("guildId", "sourceChannelId", "sourceMessageId");
CREATE INDEX "HallOfFameEntry_guildId_mirrorChannelId_idx"
  ON "HallOfFameEntry"("guildId", "mirrorChannelId");

ALTER TABLE "HallOfFameEntry"
  ADD CONSTRAINT "HallOfFameEntry_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
