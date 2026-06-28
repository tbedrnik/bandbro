import { describe, expect, test } from "bun:test";
import {
	buildSetlistChordpro,
	concertChordpro,
	transposeChordproText,
} from "./chordproPdf";

describe("transposeChordproText", () => {
	test("transposes inline chords and the key", () => {
		const src = "{key: C}\n[C]hello [G]world [Am]now [F]end";
		const out = transposeChordproText(src, 2);
		expect(out).toContain("{key: D}");
		expect(out).toContain("[D]hello [A]world [Bm]now [G]end");
	});

	test("leaves annotations and non-chords untouched", () => {
		const src = "[*Slowly] [C]hi";
		expect(transposeChordproText(src, 2)).toBe("[*Slowly] [D]hi");
	});

	test("is a no-op at 0 steps", () => {
		const src = "[C]x";
		expect(transposeChordproText(src, 0)).toBe(src);
	});
});

describe("concertChordpro", () => {
	test("capo 2: transposes up and drops the capo directive", () => {
		const src = "{title: T}\n{key: C}\n{capo: 2}\n[C]hi [G]there";
		const out = concertChordpro(src, 2);
		expect(out).toContain("[D]hi [A]there");
		expect(out).toContain("{key: D}");
		expect(out).not.toMatch(/\{capo/i);
	});

	test("no capo: unchanged", () => {
		const src = "{title: T}\n[C]hi";
		expect(concertChordpro(src, 0)).toBe(src);
	});
});

describe("buildSetlistChordpro", () => {
	const songs = [
		{
			name: "Capo Song",
			content: "{title: Capo Song}\n{capo: 2}\n[C]hi",
			capo: 2,
		},
		{ name: "Plain Song", content: "{title: Plain Song}\n[G]yo", capo: 0 },
	];

	test("separates songs with {new_song}", () => {
		const doc = buildSetlistChordpro(songs, "fingered");
		expect(doc.match(/\{new_song\}/g) ?? []).toHaveLength(1); // 2 songs → 1 separator
		expect(doc).toContain("Capo Song");
		expect(doc).toContain("Plain Song");
	});

	test("both: capo song printed twice (as-fingered + concert), plain once", () => {
		const doc = buildSetlistChordpro(songs, "both");
		// Capo Song appears as-fingered and as "(concert)"; Plain Song once.
		expect(doc).toContain("{title: Capo Song}");
		expect(doc).toContain("{title: Capo Song (concert)}");
		expect(doc).toContain("[D]hi"); // concert transposition of [C] at capo 2
		expect(doc.match(/Plain Song/g) ?? []).toHaveLength(1);
		// 3 sections → 2 separators
		expect(doc.match(/\{new_song\}/g) ?? []).toHaveLength(2);
	});

	test("concert: each song transposed once", () => {
		const doc = buildSetlistChordpro(songs, "concert");
		expect(doc).toContain("[D]hi");
		expect(doc).not.toContain("(concert)");
	});
});
