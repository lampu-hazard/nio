-- AlterTable
ALTER TABLE "BoosterCustomRole" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BoosterCustomRole" ADD COLUMN "revokedAt" TIMESTAMP(3);
