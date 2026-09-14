import { describe, expect, test } from "bun:test";
import { lineupReadiness, readinessLabel, readinessRank } from "./proficiency";

describe("lineupReadiness", () => {
	test("everyone can play it", () => {
		expect(lineupReadiness(["PLAY", "PLAY", "PLAY"])).toEqual({
			level: "PLAY",
			unknown: 0,
			total: 3,
		});
	});

	test("the weakest link sets the level — one follower makes it a rehearse", () => {
		expect(lineupReadiness(["PLAY", "FOLLOW", "PLAY"]).level).toBe("FOLLOW");
	});

	test("someone still learning outranks a follower as the blocker", () => {
		expect(lineupReadiness(["PLAY", "FOLLOW", "LEARNING"]).level).toBe(
			"LEARNING",
		);
	});

	test("unknowns are counted beside the level, never folded into it", () => {
		// Collapsing these into one score would hide the fact that someone IS learning
		// it — a different problem, with a different fix, from nobody having been asked.
		expect(lineupReadiness(["PLAY", "UNKNOWN", "LEARNING"])).toEqual({
			level: "LEARNING",
			unknown: 1,
			total: 3,
		});
	});

	test("nobody has said anything", () => {
		expect(lineupReadiness(["UNKNOWN", "UNKNOWN"])).toEqual({
			level: "UNKNOWN",
			unknown: 2,
			total: 2,
		});
	});

	test("an empty lineup is not a crash", () => {
		expect(lineupReadiness([])).toEqual({
			level: "UNKNOWN",
			unknown: 0,
			total: 0,
		});
	});
});

describe("readinessLabel", () => {
	test("names the situation and the gap", () => {
		expect(readinessLabel(lineupReadiness(["PLAY", "PLAY"]))).toBe(
			"Everyone can play",
		);
		expect(readinessLabel(lineupReadiness(["PLAY", "UNKNOWN"]))).toBe(
			"Everyone can play · 1 not said",
		);
		expect(readinessLabel(lineupReadiness(["LEARNING", "PLAY"]))).toBe(
			"Someone's learning",
		);
		expect(readinessLabel(lineupReadiness(["UNKNOWN"]))).toBe("Nobody's said");
	});

	test("an empty lineup says nothing rather than something wrong", () => {
		expect(readinessLabel(lineupReadiness([]))).toBe("");
	});
});

describe("readinessRank", () => {
	test("orders the builder: playable, then gaps, then unasked", () => {
		const ranked = [
			["UNKNOWN", "UNKNOWN"],
			["PLAY", "FOLLOW"],
			["PLAY", "PLAY"],
			["LEARNING", "PLAY"],
			["PLAY", "UNKNOWN"],
		]
			.map((ls) => lineupReadiness(ls as never))
			.map((r) => ({ label: readinessLabel(r), rank: readinessRank(r) }))
			.sort((a, b) => a.rank - b.rank)
			.map((r) => r.label);

		expect(ranked).toEqual([
			"Everyone can play",
			"Everyone can play · 1 not said",
			"Can follow",
			"Someone's learning",
			"Nobody's said yet",
		]);
	});
});
