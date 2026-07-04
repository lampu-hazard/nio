-- CreateTable
CREATE TABLE "TakoIntegration" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "creatorSlug" TEXT,
    "apiKey" TEXT,
    "webhookToken" TEXT,
    "rewardRoleId" TEXT,
    "minimumAmount" INTEGER NOT NULL DEFAULT 10000,
    "paymentMethods" TEXT[] DEFAULT ARRAY['qris']::TEXT[],
    "logChannelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TakoIntegration_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "TakoDonation" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "transactionId" TEXT,
    "amount" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "roleAssignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TakoDonation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TakoDonation_transactionId_key" ON "TakoDonation"("transactionId");
CREATE INDEX "TakoDonation_guildId_idx" ON "TakoDonation"("guildId");
CREATE INDEX "TakoDonation_discordUserId_idx" ON "TakoDonation"("discordUserId");
CREATE INDEX "TakoDonation_status_idx" ON "TakoDonation"("status");

-- AddForeignKey
ALTER TABLE "TakoIntegration" ADD CONSTRAINT "TakoIntegration_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TakoDonation" ADD CONSTRAINT "TakoDonation_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
