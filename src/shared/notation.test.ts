import { describe, expect, test } from "bun:test";
import { displayChord, displayKey, internationalChord } from "./notation";

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

describe("displayKey", () => {
	test("converts key labels and tolerates empty values", () => {
		expect(displayKey("B")).toBe("H");
		expect(displayKey("Bbm")).toBe("Bm");
		expect(displayKey(null)).toBe("");
		expect(displayKey(undefined)).toBe("");
	});
});
