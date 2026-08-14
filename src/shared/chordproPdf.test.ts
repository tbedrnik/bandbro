import { describe, expect, test } from "bun:test";
import { PAGE_BODY_HEIGHT } from "./chordproConfig";
import {
	buildSetlistChordpro,
	estimateSongHeight,
	needsTwoColumns,
} from "./chordproPdf";

/** A song of `lines` chord+lyric pairs in one labelled section. */
function song(lines: number, text = "Line of the lyric goes here"): string {
	return [
		"{title: Test}",
		"{start_of_verse: Verse 1}",
		...Array.from({ length: lines }, () => `[Em]${text}`),
		"{end_of_verse}",
	].join("\n");
}

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

	test("sets a song in two columns only when one page won't hold it", () => {
		const doc = buildSetlistChordpro(
			[
				{ name: "Short", content: song(4), capo: 0 },
				{ name: "Long", content: song(40), capo: 0 },
			],
			"fingered",
		);
		const [short, long] = doc.split("{new_song}");
		expect(short).not.toContain("{columns");
		expect(long).toContain("{columns: 2}");
		// Scoped to the song: the directive follows its title, not the document.
		expect(long).toMatch(/\{title: Test\}\n\{columns: 2\}/);
	});

	test("leaves an author's own {columns} alone", () => {
		const content = `{title: Test}\n{columns: 3}\n${song(40)}`;
		const doc = buildSetlistChordpro(
			[{ name: "Long", content, capo: 0 }],
			"fingered",
		);
		expect(doc).toContain("{columns: 3}");
		expect(doc).not.toContain("{columns: 2}");
	});
});

describe("estimateSongHeight", () => {
	// Calibrated against the chordpro CLI at A4: 26 chord+lyric pairs plus a section
	// label render on one page, 27 spill onto a second.
	test("matches the CLI's one-page capacity", () => {
		expect(needsTwoColumns(song(26))).toBe(false);
		expect(needsTwoColumns(song(27))).toBe(true);
		expect(estimateSongHeight(song(26))).toBeLessThanOrEqual(PAGE_BODY_HEIGHT);
	});

	test("counts one chord row per line, however many chords it holds", () => {
		const one = estimateSongHeight("{title: T}\n[C]one chord here");
		const many = estimateSongHeight("{title: T}\n[C]one [G]chord [D]here");
		expect(many).toBe(one);
		// A chordless line is shorter by exactly the chord row.
		expect(estimateSongHeight("{title: T}\none chord here")).toBeLessThan(one);
	});

	test("charges long lines for the rows they wrap onto", () => {
		const wide = song(1, "x".repeat(200));
		expect(estimateSongHeight(wide, 1)).toBeLessThan(
			estimateSongHeight(wide, 2),
		);
	});
});

describe("needsTwoColumns", () => {
	test("stays single-column when two columns still wouldn't fit one page", () => {
		expect(needsTwoColumns(song(40))).toBe(true);
		expect(needsTwoColumns(song(200))).toBe(false);
	});

	test("stays single-column when a tab staff is wider than a column", () => {
		const staff = `E|${"-".repeat(60)}|`;
		const withTab = [
			song(40),
			"{start_of_tab: Solo}",
			staff,
			"{end_of_tab}",
		].join("\n");
		expect(needsTwoColumns(withTab)).toBe(false);
		// A staff that does fit a half-width column doesn't block the switch.
		expect(
			needsTwoColumns(withTab.replace(staff, `E|${"-".repeat(10)}|`)),
		).toBe(true);
	});
});
