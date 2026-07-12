CREATE TABLE "TakoRewardTier" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "thresholdAmount" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TakoRewardTier_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TakoRewardTier_guildId_idx" ON "TakoRewardTier"("guildId");

CREATE UNIQUE INDEX "TakoRewardTier_guildId_thresholdAmount_key" ON "TakoRewardTier"("guildId", "thresholdAmount");

ALTER TABLE "TakoRewardTier" ADD CONSTRAINT "TakoRewardTier_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
