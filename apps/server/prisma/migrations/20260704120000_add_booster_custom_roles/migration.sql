-- CreateTable
CREATE TABLE "BoosterRoleClaimToken" (
    "token" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoosterRoleClaimToken_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "BoosterCustomRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoosterCustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoosterRoleClaimToken_guildId_userId_key" ON "BoosterRoleClaimToken"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "BoosterCustomRole_roleId_key" ON "BoosterCustomRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "BoosterCustomRole_guildId_userId_key" ON "BoosterCustomRole"("guildId", "userId");
