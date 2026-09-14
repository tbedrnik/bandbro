-- Lineups (CLAUDE.md §D25): split the *performing identity* out of Organization so one
-- band can perform under several names over ONE shared song library.
--
-- Backfill contract: every existing band gets exactly one default lineup named after it,
-- holding every current member, and every existing setlist is repointed at it. The default
-- lineup's id is derived from the band's ('dflt-' || organization.id) — the same formula
-- `defaultLineupId()` uses at runtime, so the backfill and the app can never disagree.

-- CreateTable
CREATE TABLE "lineup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "lineup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "lineup_organizationId_idx" ON "lineup"("organizationId");

-- CreateTable
CREATE TABLE "lineup_member" (
    "lineupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("lineupId", "userId"),
    CONSTRAINT "lineup_member_lineupId_fkey" FOREIGN KEY ("lineupId") REFERENCES "lineup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lineup_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "lineup_member_userId_idx" ON "lineup_member"("userId");

-- Backfill: one default lineup per band, named after the band.
INSERT INTO "lineup" ("id", "name", "organizationId", "isDefault", "createdAt", "updatedAt")
SELECT 'dflt-' || o."id", o."name", o."id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organization" o;

-- Backfill: every current member plays in their band's default lineup. DISTINCT because
-- `member` carries no unique([organizationId, userId]) — a user can hold two rows there.
INSERT OR IGNORE INTO "lineup_member" ("lineupId", "userId", "createdAt")
SELECT DISTINCT 'dflt-' || m."organizationId", m."userId", CURRENT_TIMESTAMP
FROM "member" m;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_songbook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "lineupId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "songbook_lineupId_fkey" FOREIGN KEY ("lineupId") REFERENCES "lineup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "songbook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Every setlist lands on its own band's default lineup.
INSERT INTO "new_songbook" ("createdAt", "description", "id", "organizationId", "title", "updatedAt", "lineupId")
SELECT s."createdAt", s."description", s."id", s."organizationId", s."title", s."updatedAt", 'dflt-' || s."organizationId"
FROM "songbook" s;
DROP TABLE "songbook";
ALTER TABLE "new_songbook" RENAME TO "songbook";
CREATE INDEX "songbook_organizationId_idx" ON "songbook"("organizationId");
CREATE INDEX "songbook_lineupId_idx" ON "songbook"("lineupId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
