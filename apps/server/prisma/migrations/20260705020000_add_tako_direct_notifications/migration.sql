-- AlterTable
ALTER TABLE "TakoIntegration" ADD COLUMN "directNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TakoIntegration" ADD COLUMN "directNotificationChannelId" TEXT;
ALTER TABLE "TakoIntegration" ADD COLUMN "directNotifyMinimumAmount" INTEGER NOT NULL DEFAULT 0;
