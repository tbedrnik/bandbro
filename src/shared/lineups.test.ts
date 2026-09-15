import { describe, expect, test } from "bun:test";
import {
	defaultLineupOf,
	hasMultipleLineups,
	lineupLabel,
	lineupOptionLabel,
	lineupsOf,
} from "./lineups";

const lineups = [
	{ id: "l1", name: "Banda", isDefault: true, organizationId: "o1" },
	{ id: "l2", name: "Duo Tomi Kohy", isDefault: false, organizationId: "o1" },
	{ id: "l3", name: "Solo", isDefault: true, organizationId: "o2" },
];

describe("lineupsOf", () => {
	test("keeps only the band asked for", () => {
		expect(lineupsOf(lineups, "o1").map((l) => l.id)).toEqual(["l1", "l2"]);
	});

	test("is empty for an unknown or absent band", () => {
		expect(lineupsOf(lineups, "nope")).toEqual([]);
		expect(lineupsOf(lineups, null)).toEqual([]);
		expect(lineupsOf(undefined, "o1")).toEqual([]);
	});
});

describe("hasMultipleLineups", () => {
	test("a band performing under one name hides the concept entirely", () => {
		expect(hasMultipleLineups(lineups, "o2")).toBe(false);
	});

	test("a second lineup is what reveals it", () => {
		expect(hasMultipleLineups(lineups, "o1")).toBe(true);
	});

	test("no data means no lineup UI, never a crash", () => {
		expect(hasMultipleLineups(undefined, "o1")).toBe(false);
		expect(hasMultipleLineups(lineups, undefined)).toBe(false);
	});
});

describe("lineupLabel", () => {
	test("a default lineup defers to the band name — 'Banda · Banda' is noise", () => {
		expect(lineupLabel(lineups[0], "Banda")).toBe("Banda");
	});

	test("a named lineup is the performing identity, so it wins", () => {
		expect(lineupLabel(lineups[1], "Banda")).toBe("Duo Tomi Kohy");
	});

	test("falls back cleanly with nothing to show", () => {
		expect(lineupLabel(null, "Banda")).toBe("Banda");
		expect(lineupLabel(null)).toBe("");
	});
});

describe("defaultLineupOf", () => {
	test("finds the band's main lineup — where a new setlist lands", () => {
		expect(defaultLineupOf(lineups, "o1")?.id).toBe("l1");
	});

	test("is undefined rather than throwing when the band has none yet", () => {
		expect(defaultLineupOf(lineups, "nope")).toBeUndefined();
	});
});

describe("lineupOptionLabel", () => {
	test("the band leads — it is what a player recognises", () => {
		expect(lineupOptionLabel(lineups[1]!, "Banda")).toBe(
			"Banda · Duo Tomi Kohy",
		);
	});

	test("a default lineup adds nothing, so it is just the band", () => {
		expect(lineupOptionLabel(lineups[0]!, "Banda")).toBe("Banda");
	});
});
