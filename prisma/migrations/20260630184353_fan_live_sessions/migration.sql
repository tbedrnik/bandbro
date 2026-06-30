-- CreateTable
CREATE TABLE "live_session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "songbookId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "currentSongIndex" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "live_session_songbookId_fkey" FOREIGN KEY ("songbookId") REFERENCES "songbook" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "live_session_code_key" ON "live_session"("code");

-- CreateIndex
CREATE INDEX "live_session_songbookId_idx" ON "live_session"("songbookId");
