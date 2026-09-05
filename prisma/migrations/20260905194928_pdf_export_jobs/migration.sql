-- CreateTable
CREATE TABLE "pdf_export" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songbookId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'both',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "filePath" TEXT,
    "filename" TEXT,
    "bytes" INTEGER,
    "songCount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    CONSTRAINT "pdf_export_songbookId_fkey" FOREIGN KEY ("songbookId") REFERENCES "songbook" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pdf_export_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "pdf_export_songbookId_idx" ON "pdf_export"("songbookId");

-- CreateIndex
CREATE INDEX "pdf_export_status_idx" ON "pdf_export"("status");
