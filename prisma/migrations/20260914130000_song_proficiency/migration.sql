-- Who can play what (CLAUDE.md §D26). No backfill: a missing row *is* the UNKNOWN
-- default, so an existing library starts out honestly unasked rather than pretending
-- every song is either playable or not.

-- CreateTable
CREATE TABLE "song_proficiency" (
    "userId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "songId"),
    CONSTRAINT "song_proficiency_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "song_proficiency_songId_fkey" FOREIGN KEY ("songId") REFERENCES "song" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "song_proficiency_songId_idx" ON "song_proficiency"("songId");
