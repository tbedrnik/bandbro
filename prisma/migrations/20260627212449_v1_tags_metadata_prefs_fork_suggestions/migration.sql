-- AlterTable
ALTER TABLE "chart" ADD COLUMN "tempo" INTEGER;
ALTER TABLE "chart" ADD COLUMN "timeSignature" TEXT;

-- CreateTable
CREATE TABLE "tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "song_tag" (
    "songId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("songId", "tagId"),
    CONSTRAINT "song_tag_songId_fkey" FOREIGN KEY ("songId") REFERENCES "song" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "song_tag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "suggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chartId" TEXT NOT NULL,
    "proposedContent" TEXT NOT NULL,
    "message" TEXT,
    "proposerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "suggestion_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "chart" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "suggestion_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_song" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "organizationId" TEXT,
    "forkedFromId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "song_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "song_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "song" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_song" ("createdAt", "id", "name", "organizationId", "slug", "updatedAt", "year") SELECT "createdAt", "id", "name", "organizationId", "slug", "updatedAt", "year" FROM "song";
DROP TABLE "song";
ALTER TABLE "new_song" RENAME TO "song";
CREATE UNIQUE INDEX "song_slug_key" ON "song"("slug");
CREATE INDEX "song_organizationId_idx" ON "song"("organizationId");
CREATE TABLE "new_user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "defaultChordView" TEXT NOT NULL DEFAULT 'fingered',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_user" ("createdAt", "email", "emailVerified", "id", "image", "name", "updatedAt") SELECT "createdAt", "email", "emailVerified", "id", "image", "name", "updatedAt" FROM "user";
DROP TABLE "user";
ALTER TABLE "new_user" RENAME TO "user";
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "tag_slug_key" ON "tag"("slug");

-- CreateIndex
CREATE INDEX "song_tag_tagId_idx" ON "song_tag"("tagId");

-- CreateIndex
CREATE INDEX "suggestion_chartId_idx" ON "suggestion"("chartId");

-- CreateIndex
CREATE INDEX "suggestion_proposerId_idx" ON "suggestion"("proposerId");

-- CreateIndex
CREATE INDEX "chart_songId_idx" ON "chart"("songId");

-- CreateIndex
CREATE INDEX "chart_organizationId_idx" ON "chart"("organizationId");

-- CreateIndex
CREATE INDEX "songbook_organizationId_idx" ON "songbook"("organizationId");
