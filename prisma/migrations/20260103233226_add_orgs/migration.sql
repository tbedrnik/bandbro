/*
  Warnings:

  - You are about to drop the column `userId` on the `chart` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `song` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `songbook` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `credit` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `songbook` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `songbook_song` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "session" ADD COLUMN "activeOrganizationId" TEXT;

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "createdAt" DATETIME NOT NULL,
    "metadata" TEXT
);

-- CreateTable
CREATE TABLE "member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviterId" TEXT NOT NULL,
    CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_chart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "description" TEXT,
    "key" TEXT,
    "capo" INTEGER,
    "songId" TEXT NOT NULL,
    "organizationId" TEXT,
    "forkedFromId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "chart_songId_fkey" FOREIGN KEY ("songId") REFERENCES "song" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chart_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chart_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "chart" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_chart" ("capo", "content", "createdAt", "description", "forkedFromId", "id", "key", "songId", "updatedAt") SELECT "capo", "content", "createdAt", "description", "forkedFromId", "id", "key", "songId", "updatedAt" FROM "chart";
DROP TABLE "chart";
ALTER TABLE "new_chart" RENAME TO "chart";
CREATE TABLE "new_credit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ARTIST',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "credit_songId_fkey" FOREIGN KEY ("songId") REFERENCES "song" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "credit_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_credit" ("artistId", "id", "role", "songId") SELECT "artistId", "id", "role", "songId" FROM "credit";
DROP TABLE "credit";
ALTER TABLE "new_credit" RENAME TO "credit";
CREATE UNIQUE INDEX "credit_songId_artistId_role_key" ON "credit"("songId", "artistId", "role");
CREATE TABLE "new_song" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "organizationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "song_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_song" ("createdAt", "id", "name", "slug", "updatedAt", "year") SELECT "createdAt", "id", "name", "slug", "updatedAt", "year" FROM "song";
DROP TABLE "song";
ALTER TABLE "new_song" RENAME TO "song";
CREATE UNIQUE INDEX "song_slug_key" ON "song"("slug");
CREATE TABLE "new_songbook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "songbook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_songbook" ("createdAt", "description", "id", "title", "updatedAt") SELECT "createdAt", "description", "id", "title", "updatedAt" FROM "songbook";
DROP TABLE "songbook";
ALTER TABLE "new_songbook" RENAME TO "songbook";
CREATE TABLE "new_songbook_song" (
    "songbookId" TEXT NOT NULL,
    "chartId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("songbookId", "chartId"),
    CONSTRAINT "songbook_song_songbookId_fkey" FOREIGN KEY ("songbookId") REFERENCES "songbook" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "songbook_song_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "chart" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_songbook_song" ("chartId", "order", "songbookId") SELECT "chartId", "order", "songbookId" FROM "songbook_song";
DROP TABLE "songbook_song";
ALTER TABLE "new_songbook_song" RENAME TO "songbook_song";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "member_organizationId_idx" ON "member"("organizationId");

-- CreateIndex
CREATE INDEX "member_userId_idx" ON "member"("userId");

-- CreateIndex
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");
