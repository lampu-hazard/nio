-- AlterTable
ALTER TABLE "BoosterCustomRole" ADD COLUMN "primaryColor" TEXT NOT NULL DEFAULT '#ffffff';
ALTER TABLE "BoosterCustomRole" ADD COLUMN "secondaryColor" TEXT;
ALTER TABLE "BoosterCustomRole" ADD COLUMN "tertiaryColor" TEXT;
ALTER TABLE "BoosterCustomRole" ADD COLUMN "iconUrl" TEXT;

-- Backfill primaryColor from the previous single-color column.
UPDATE "BoosterCustomRole" SET "primaryColor" = "color" WHERE "color" IS NOT NULL;
