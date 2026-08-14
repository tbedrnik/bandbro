import { describe, expect, test } from "bun:test";
import {
	displayChord,
	displayKey,
	internationalChord,
	isChord,
} from "./notation";

/** Bracket tokens a chord sheet holds that are *not* chords. */
const NOT_CHORDS = [
	"Bridge",
	"Chorus",
	"Repeat this",
	"Post chorus",
	"Break",
	"Ending",
	"Coda",
	"Riff",
	"Repeat verse 2",
	"Em, G#, Eb, Bb",
	"N.C.",
];

/** Real chords, in both conventions. */
const CHORDS = [
	"B",
	"Bb",
	"H",
	"Bm7",
	"F#/A#",
	"C",
	"Am",
	"Emi",
	"Hmi",
	"G/F#",
	"Ebsus4",
	"F#m7b5",
	"Cadd9",
	"A#",
	"Cb",
	"G+",
	"C(no3)",
];

describe("displayChord (European by default)", () => {
	test("B natural becomes H", () => {
		expect(displayChord("B")).toBe("H");
		expect(displayChord("Bm")).toBe("Hm");
		expect(displayChord("Bmaj7")).toBe("Hmaj7");
		expect(displayChord("Cb")).toBe("H");
	});

	test("everything sounding as B-flat becomes B", () => {
		expect(displayChord("Bb")).toBe("B");
		expect(displayChord("A#")).toBe("B");
		expect(displayChord("Bbmaj7")).toBe("Bmaj7");
		expect(displayChord("A#m7")).toBe("Bm7");
	});

	test("slash basses are converted too", () => {
		expect(displayChord("D/B")).toBe("D/H");
		expect(displayChord("F#/Bb")).toBe("F#/B");
		expect(displayChord("B/F#")).toBe("H/F#");
	});

	test("other chords, annotations and already-European input pass through", () => {
		for (const c of ["C", "Am", "F#m7", "Eb", "D/A", "", "H", "Hm", "N.C."]) {
			expect(displayChord(c)).toBe(c);
		}
	});

	test("international convention is a no-op", () => {
		expect(displayChord("B", "international")).toBe("B");
		expect(displayChord("Bb", "international")).toBe("Bb");
	});
});

describe("internationalChord", () => {
	test("rewrites European note names to international ones", () => {
		expect(internationalChord("H")).toBe("B");
		expect(internationalChord("Hm7")).toBe("Bm7");
		expect(internationalChord("B")).toBe("Bb");
		expect(internationalChord("Bmaj7")).toBe("Bbmaj7");
		expect(internationalChord("H/F#")).toBe("B/F#");
		expect(internationalChord("D/H")).toBe("D/B");
	});

	test("leaves unambiguous chords alone", () => {
		for (const c of ["Am", "G/F#", "C", "Ebsus4", "F#m7b5", ""]) {
			expect(internationalChord(c)).toBe(c);
		}
	});

	test("international convention is a no-op", () => {
		expect(internationalChord("H", "international")).toBe("H");
	});

	test("round trip preserves pitch (A# respelled as its equal, Bb)", () => {
		for (const [written, back] of [
			["B", "B"],
			["Bb", "Bb"],
			["Bm", "Bm"],
			["A#", "Bb"],
			["C", "C"],
			["D/Bb", "D/Bb"],
		]) {
			expect(internationalChord(displayChord(written))).toBe(back);
		}
	});
});

describe("isChord", () => {
	test("recognizes chords in both conventions", () => {
		for (const c of CHORDS) expect(isChord(c)).toBe(true);
	});

	test("rejects section markers, notes to the player and chord lists", () => {
		for (const t of NOT_CHORDS) expect(isChord(t)).toBe(false);
	});

	test("rejects empty and missing tokens", () => {
		expect(isChord("")).toBe(false);
		expect(isChord("   ")).toBe(false);
		expect(isChord(null)).toBe(false);
		expect(isChord(undefined)).toBe(false);
	});
});

describe("tokens that aren't chords are never rewritten", () => {
	test("both directions pass them through byte-for-byte", () => {
		for (const t of NOT_CHORDS) {
			expect(displayChord(t)).toBe(t);
			expect(internationalChord(t)).toBe(t);
		}
	});

	test("the specific regressions: [Bridge] and [Chorus] keep their names", () => {
		expect(displayChord("Bridge")).toBe("Bridge");
		expect(internationalChord("Bridge")).toBe("Bridge");
		expect(displayChord("Chorus")).toBe("Chorus");
		expect(internationalChord("Chorus")).toBe("Chorus");
		expect(displayChord("Repeat this")).toBe("Repeat this");
		expect(internationalChord("Repeat this")).toBe("Repeat this");
	});

	test("real chords still convert (the guard isn't too tight)", () => {
		expect(displayChord("B")).toBe("H");
		expect(displayChord("Bb")).toBe("B");
		expect(displayChord("Bm7")).toBe("Hm7");
		expect(displayChord("F#/A#")).toBe("F#/B");
		expect(internationalChord("H")).toBe("B");
		expect(internationalChord("B")).toBe("Bb");
		expect(internationalChord("Hmi")).toBe("Bmi");
	});
});

describe("displayKey", () => {
	test("converts key labels and tolerates empty values", () => {
		expect(displayKey("B")).toBe("H");
		expect(displayKey("Bbm")).toBe("Bm");
		expect(displayKey(null)).toBe("");
		expect(displayKey(undefined)).toBe("");
	});
});
