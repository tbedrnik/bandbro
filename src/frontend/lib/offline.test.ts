import { beforeEach, describe, expect, test } from "bun:test";

/**
 * The offline store is pure localStorage bookkeeping, so it tests headlessly against an
 * in-memory Storage stand-in installed before the module is imported.
 */
class MemoryStorage implements Storage {
	private map = new Map<string, string>();
	quota = Number.POSITIVE_INFINITY;
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
		if (v.length > this.quota) throw new Error("QuotaExceededError");
		this.map.set(k, v);
	}
	removeItem(k: string) {
		this.map.delete(k);
	}
	clear() {
		this.map.clear();
	}
}

const store = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: store });

const {
	downloadSetlist,
	getOfflineSetlist,
	isDownloaded,
	listOfflineSetlists,
	removeOfflineSetlist,
} = await import("./offline");

const setlist = (title: string, songs: number) => ({
	id: "ignored",
	title,
	songs: Array.from({ length: songs }, (_, i) => ({ chartId: `c${i}` })),
});

beforeEach(() => {
	store.clear();
	store.quota = Number.POSITIVE_INFINITY;
});

describe("offline setlist store", () => {
	test("round-trips a payload verbatim", () => {
		const payload = setlist("Friday at The Anchor", 3);
		expect(downloadSetlist("sb1", payload)).toBe(true);
		expect(getOfflineSetlist<typeof payload>("sb1")).toEqual(payload);
		expect(isDownloaded("sb1")).toBe(true);
		expect(isDownloaded("nope")).toBe(false);
	});

	test("lists downloads with derived metadata, newest first", () => {
		downloadSetlist("older", setlist("Older set", 2));
		downloadSetlist("newer", setlist("Newer set", 5));
		// Both land in the same millisecond in a test; force a distinguishable order.
		const raw = JSON.parse(store.getItem("bandbro:offline:meta") as string);
		raw.older.downloadedAt = 1000;
		raw.newer.downloadedAt = 2000;
		store.setItem("bandbro:offline:meta", JSON.stringify(raw));

		expect(listOfflineSetlists()).toEqual([
			{ id: "newer", title: "Newer set", songCount: 5, downloadedAt: 2000 },
			{ id: "older", title: "Older set", songCount: 2, downloadedAt: 1000 },
		]);
	});

	test("rebuilds the listing from payloads written before the index existed", () => {
		// Exactly what the previous version of this module wrote: payload only.
		store.setItem(
			"bandbro:offline:setlist:legacy",
			JSON.stringify(setlist("Legacy set", 4)),
		);
		expect(listOfflineSetlists()).toEqual([
			{ id: "legacy", title: "Legacy set", songCount: 4, downloadedAt: 0 },
		]);
		// …and folds the repair back into the index so the next read is cheap.
		const index = JSON.parse(store.getItem("bandbro:offline:meta") as string);
		expect(index.legacy.title).toBe("Legacy set");
	});

	test("names an untitled or malformed payload rather than showing a blank row", () => {
		store.setItem("bandbro:offline:setlist:junk", "{]");
		store.setItem("bandbro:offline:setlist:empty", JSON.stringify({}));
		expect(listOfflineSetlists().map((m) => [m.title, m.songCount])).toEqual([
			["Untitled setlist", 0],
			["Untitled setlist", 0],
		]);
	});

	test("removing drops both the payload and its index entry", () => {
		downloadSetlist("sb1", setlist("A", 1));
		downloadSetlist("sb2", setlist("B", 1));
		removeOfflineSetlist("sb1");
		expect(isDownloaded("sb1")).toBe(false);
		expect(getOfflineSetlist("sb1")).toBeNull();
		expect(listOfflineSetlists().map((m) => m.id)).toEqual(["sb2"]);
		expect(store.getItem("bandbro:offline:meta")).not.toContain("sb1");
	});

	test("an index entry whose payload vanished is pruned from the listing", () => {
		downloadSetlist("sb1", setlist("A", 1));
		store.removeItem("bandbro:offline:setlist:sb1");
		expect(listOfflineSetlists()).toEqual([]);
		expect(store.getItem("bandbro:offline:meta")).toBe("{}");
	});

	test("reports a failed write instead of claiming the set is on the device", () => {
		store.quota = 10;
		expect(downloadSetlist("sb1", setlist("Too big", 40))).toBe(false);
		expect(isDownloaded("sb1")).toBe(false);
		expect(listOfflineSetlists()).toEqual([]);
	});
});
