import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL || "" });

/**
 * `PRISMA_LOG_QUERIES=1` prints every statement the app issues.
 *
 * Off by default (it is noisy and it is on the hot path), but it is the cheap way to
 * catch a read path that has quietly become N+1 — which `lineupsList` had, at ~18
 * queries per request for a user in four bands (CLAUDE.md §D27).
 */
export const prisma = new PrismaClient({
	adapter,
	...(process.env.PRISMA_LOG_QUERIES ? { log: ["query" as const] } : {}),
});
