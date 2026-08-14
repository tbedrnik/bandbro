import { describe, expect, test } from "bun:test";
import { buildSetlistChordpro } from "./chordproPdf";

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
