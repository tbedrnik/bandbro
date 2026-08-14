import { describe, expect, test } from "bun:test";
import { parseChordpro } from "./chordpro";

describe("parseChordpro tab sections", () => {
	const song = [
		"{title: Pohoda}",
		"{start_of_tab}",
		"   [D]    [A]",
		"e|---2-x-0------|",
		"",
		"H|-3-------3----|",
		"{end_of_tab}",
		"{start_of_verse}",
		"[F#m]Vezmu tě má milá",
		"{end_of_verse}",
	].join("\n");

	test("keeps the source column width of every chord marker", () => {
		const [tab] = parseChordpro(song).blocks;
		expect(tab.kind).toBe("tab");
		// `[D]` is 3 columns wide, `[A]` likewise — the renderer pads the chord back
		// out to that width so the staff below stays aligned.
		expect(tab.lines[0]).toEqual([
			{ chord: "", text: "   " },
			{ chord: "D", text: "    ", width: 3 },
			{ chord: "A", text: "", width: 3 },
		]);
	});

	test("keeps blank lines inside a tab (the gap between staves)", () => {
		const [tab] = parseChordpro(song).blocks;
		expect(tab.lines.map((line) => line.map((s) => s.text).join(""))).toEqual([
			"       ",
			"e|---2-x-0------|",
			"",
			"H|-3-------3----|",
		]);
	});

	test("lyric lines carry no width — only tabs are column-sensitive", () => {
		const verse = parseChordpro(song).blocks[1];
		expect(verse.kind).toBe("verse");
		expect(verse.lines[0]).toEqual([
			{ chord: "F#m", text: "Vezmu tě má milá" },
		]);
	});
});
