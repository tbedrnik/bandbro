import { describe, expect, test } from "bun:test";
import { isSnapshotStale, setlistFingerprint } from "./setlistFingerprint";

const set = (over: object = {}) => ({
	title: "Friday @ The Anchor",
	songs: [
		{ chartId: "c1", chart: { updatedAt: "2026-09-01T10:00:00.000Z" } },
		{ chartId: "c2", chart: { updatedAt: "2026-09-02T10:00:00.000Z" } },
	],
	...over,
});

describe("setlistFingerprint", () => {
	test("is stable across identical payloads", () => {
		expect(setlistFingerprint(set())).toBe(setlistFingerprint(set()));
	});

	test("accepts Date and ISO string alike — one is the API, one is the snapshot", () => {
		const asDates = set({
			songs: [
				{
					chartId: "c1",
					chart: { updatedAt: new Date("2026-09-01T10:00:00.000Z") },
				},
				{
					chartId: "c2",
					chart: { updatedAt: new Date("2026-09-02T10:00:00.000Z") },
				},
			],
		});
		expect(setlistFingerprint(asDates)).toBe(setlistFingerprint(set()));
	});

	test("nothing to fingerprint is the empty string, not a crash", () => {
		expect(setlistFingerprint(null)).toBe("");
		expect(setlistFingerprint(undefined)).toBe("");
		expect(setlistFingerprint({})).toBe("");
		expect(setlistFingerprint({ title: "x", songs: null })).toBe("x");
	});
});

describe("isSnapshotStale", () => {
	test("an untouched set is not stale", () => {
		expect(isSnapshotStale(set(), set())).toBe(false);
	});

	test("a renamed set is stale", () => {
		expect(isSnapshotStale(set(), set({ title: "Saturday" }))).toBe(true);
	});

	test("an edited chart is stale — the songbook row alone would not show this", () => {
		const edited = set({
			songs: [
				{ chartId: "c1", chart: { updatedAt: "2026-09-14T09:00:00.000Z" } },
				{ chartId: "c2", chart: { updatedAt: "2026-09-02T10:00:00.000Z" } },
			],
		});
		expect(isSnapshotStale(set(), edited)).toBe(true);
	});

	test("a reordered set is stale — the running order is the point", () => {
		const reordered = set({
			songs: [
				{ chartId: "c2", chart: { updatedAt: "2026-09-02T10:00:00.000Z" } },
				{ chartId: "c1", chart: { updatedAt: "2026-09-01T10:00:00.000Z" } },
			],
		});
		expect(isSnapshotStale(set(), reordered)).toBe(true);
	});

	test("an added or removed song is stale", () => {
		const added = set({
			songs: [
				...set().songs,
				{ chartId: "c3", chart: { updatedAt: "2026-09-03T10:00:00.000Z" } },
			],
		});
		expect(isSnapshotStale(set(), added)).toBe(true);
		expect(isSnapshotStale(set(), set({ songs: [set().songs[0]] }))).toBe(true);
	});

	test("a missing side is never stale — a failed fetch must not cry wolf at a gig", () => {
		expect(isSnapshotStale(null, set())).toBe(false);
		expect(isSnapshotStale(set(), null)).toBe(false);
		expect(isSnapshotStale(undefined, undefined)).toBe(false);
	});
});
