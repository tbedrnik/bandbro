/*
  Warnings:

  - You are about to drop the column `artist` on the `song` table. All the data in the column will be lost.
  - You are about to drop the column `content` on the `song` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `song` table. All the data in the column will be lost.
  - Added the required column `name` to the `song` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `song` table without a default value. This is not possible if the table is not empty.

*/

-- RedefineTables
DROP TABLE "song";
CREATE TABLE "song" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT,
    CONSTRAINT "song_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "song_slug_key" ON "song"("slug");

-- CreateTable
CREATE TABLE "chart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "description" TEXT,
    "key" TEXT,
    "capo" INTEGER,
    "songId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "forkedFromId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "chart_songId_fkey" FOREIGN KEY ("songId") REFERENCES "song" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chart_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "chart" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "artist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "credit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ARTIST',
    CONSTRAINT "credit_songId_fkey" FOREIGN KEY ("songId") REFERENCES "song" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "credit_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "songbook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "songbook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "songbook_song" (
    "songbookId" TEXT NOT NULL,
    "chartId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("songbookId", "chartId"),
    CONSTRAINT "songbook_song_songbookId_fkey" FOREIGN KEY ("songbookId") REFERENCES "songbook" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "songbook_song_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "chart" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "artist_slug_key" ON "artist"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "credit_songId_artistId_role_key" ON "credit"("songId", "artistId", "role");
