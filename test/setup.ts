import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Preloaded before every test file (see bunfig.toml).
 *
 * `src/backend/prisma.ts` reads DATABASE_URL once, when it is first imported, and Bun
 * shares the module cache across a run — so whichever test file happened to pull in a
 * backend service first would fix the database URL for all of them. Setting it here,
 * before any test module loads, makes a DB-backed test work in any order.
 *
 * Each run gets its own throwaway SQLite file; a test that wants a schema in it applies
 * the migrations itself.
 */
if (!process.env.DATABASE_URL) {
	const dir = mkdtempSync(join(tmpdir(), "bandbro-test-"));
	process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
}
