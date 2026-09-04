-- CreateTable
CREATE TABLE "band_invite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'reader',
    "createdById" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "maxUses" INTEGER,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "band_invite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "band_invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "band_invite_use" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inviteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "band_invite_use_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "band_invite" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "band_invite_use_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "band_invite_code_key" ON "band_invite"("code");

-- CreateIndex
CREATE INDEX "band_invite_organizationId_idx" ON "band_invite"("organizationId");

-- CreateIndex
CREATE INDEX "band_invite_use_inviteId_idx" ON "band_invite_use"("inviteId");

-- CreateIndex
CREATE UNIQUE INDEX "band_invite_use_inviteId_userId_key" ON "band_invite_use"("inviteId", "userId");
