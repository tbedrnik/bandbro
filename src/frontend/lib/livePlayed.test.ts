import { beforeEach, describe, expect, test } from "bun:test";

/**
 * The played store is localStorage bookkeeping, so it tests headlessly against an
 * in-memory Storage stand-in installed before the module is imported — same arrangement
 * as `offline.test.ts`.
 */
class MemoryStorage implements Storage {
	private map = new Map<string, string>();
	get length() {
		return this.map.size;
	}
	key(i: number) {
		return [...this.map.keys()][i] ?? null;
	}
	getItem(k: string) {
		return this.map.get(k) ?? null;
	}
	setItem(k: string, v: string) {
		this.map.set(k, v);
	}
	removeItem(k: string) {
		this.map.delete(k);
	}
	clear() {
		this.map.clear();
	}
}

// Always install this file's own stand-in. Deferring to whatever another test file left
// on the global looks safe but isn't: offline.test.ts's store carries a `quota` its own
// tests shrink, so these tests were running against a storage that rejected ordinary
// writes. Every stand-in is `configurable`, so each file can claim the global in turn.
Object.defineProperty(globalThis, "localStorage", {
	value: new MemoryStorage(),
	configurable: true,
});

const { clearPlayed, formatPlayedAge, playedKey, readPlayed, writePlayed } =
	await import("./livePlayed");

beforeEach(() => localStorage.clear());

describe("playedKey", () => {
	test("keys by chart, so editing the set keeps the evening's marks", () => {
		expect(playedKey({ chartId: "chart_1", id: "row_9" }, 3)).toBe("chart_1");
	});

	test("falls back to the row id, then to the position", () => {
		expect(playedKey({ id: "row_9" }, 3)).toBe("row_9");
		expect(playedKey(undefined, 3)).toBe("#3");
		expect(playedKey({ chartId: null, id: null }, 0)).toBe("#0");
	});
});

describe("read/write", () => {
	test("round-trips the marks and stamps them", () => {
		const before = Date.now();
		writePlayed("set_1", ["a", "b"]);
		const saved = readPlayed("set_1");
		expect(saved?.ids).toEqual(["a", "b"]);
		expect(saved?.updatedAt).toBeGreaterThanOrEqual(before);
	});

	test("setlists don't see each other's marks", () => {
		writePlayed("set_1", ["a"]);
		expect(readPlayed("set_2")).toBeNull();
	});

	test("an empty set removes the key, so nothing is left to resume", () => {
		writePlayed("set_1", ["a"]);
		writePlayed("set_1", []);
		expect(localStorage.getItem("bandbro:live:played:set_1")).toBeNull();
		expect(readPlayed("set_1")).toBeNull();
		clearPlayed("set_1");
		expect(readPlayed("set_1")).toBeNull();
	});

	test("junk on disk reads as nothing rather than throwing", () => {
		localStorage.setItem("bandbro:live:played:set_1", "{not json");
		expect(readPlayed("set_1")).toBeNull();
		localStorage.setItem("bandbro:live:played:set_2", '{"ids":[1,null,"a"]}');
		expect(readPlayed("set_2")?.ids).toEqual(["a"]);
		localStorage.setItem("bandbro:live:played:set_3", '{"ids":[]}');
		expect(readPlayed("set_3")).toBeNull();
	});
});

describe("formatPlayedAge", () => {
	const now = Date.UTC(2026, 0, 15, 12, 0, 0);
	const ago = (ms: number) => formatPlayedAge(now - ms, now);

	// The exact wording belongs to Intl (and to the reader's locale) since §D27, so these
	// pin the *units* — which is what actually tells a player what they're looking at.
	test("minutes and hours, which is what a set break looks like", () => {
		expect(ago(20_000)).toMatch(/now/i);
		expect(ago(5 * 60_000)).toMatch(/\b5\b.*min/i);
		expect(ago(59 * 60_000)).toMatch(/\b59\b.*min/i);
		expect(ago(60 * 60_000)).toMatch(/hour/i);
		expect(ago(5 * 3_600_000)).toMatch(/\b5\b.*hour/i);
	});

	test("days, which is what last week's gig looks like", () => {
		expect(ago(26 * 3_600_000)).toBe("yesterday");
		expect(ago(4 * 86_400_000)).toMatch(/\b4\b.*day/i);
	});

	test("a missing stamp is not a date in 1970", () => {
		expect(formatPlayedAge(0, now)).toMatch(/now/i);
	});
});
