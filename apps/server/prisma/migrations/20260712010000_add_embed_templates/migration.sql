CREATE TABLE "EmbedTemplate" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmbedTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmbedTemplate_guildId_idx" ON "EmbedTemplate"("guildId");

CREATE UNIQUE INDEX "EmbedTemplate_guildId_category_key" ON "EmbedTemplate"("guildId", "category");

ALTER TABLE "EmbedTemplate" ADD CONSTRAINT "EmbedTemplate_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
