import { describe, expect, test } from "bun:test";
import { parseChordpro } from "./chordpro";
import { buildSetlistChordpro, estimateSongHeight } from "./chordproPdf";
import {
	chorusSignature,
	collapseChorusBlocks,
	collapseChorusesInSource,
} from "./chorusCollapse";
import { buildSongView } from "./songView";

const CHORUS = "Let it [C]be, let it [G]be\n[Am]Whisper words of [F]wisdom";

const SONG = `{title: Let It Be}
{start_of_verse: Verse 1}
When I [C]find myself in times of [G]trouble
{end_of_verse}

{start_of_chorus}
${CHORUS}
{end_of_chorus}

{start_of_verse: Verse 2}
And in my [C]hour of darkness
{end_of_verse}

{start_of_chorus}
${CHORUS}
{end_of_chorus}
`;

describe("chorusSignature", () => {
	test("ignores trailing whitespace and blank lines", () => {
		expect(chorusSignature(["a  ", "", "b\t"])).toBe(
			chorusSignature(["a", "b"]),
		);
	});

	test("a single changed word is a different chorus", () => {
		expect(chorusSignature(["Let it be"])).not.toBe(
			chorusSignature(["Let them be"]),
		);
	});
});

describe("collapseChorusBlocks", () => {
	test("the first chorus is kept, the repeat becomes a recall", () => {
		const { blocks } = parseChordpro(SONG);
		const collapsed = collapseChorusBlocks(blocks);
		expect(collapsed).toHaveLength(blocks.length);
		expect(collapsed[1].lines).toHaveLength(2);
		expect(collapsed[3]).toEqual({
			kind: "chorus",
			label: "Chorus",
			recall: true,
			lines: [],
		});
	});

	test("a chorus that differs is printed in full", () => {
		const { blocks } = parseChordpro(
			SONG.replace(
				"[Am]Whisper words of [F]wisdom\n{end_of_chorus}\n",
				"[Am]Speak my words of [F]wisdom\n{end_of_chorus}\n",
			),
		);
		const collapsed = collapseChorusBlocks(blocks);
		expect(collapsed.every((b) => !b.recall)).toBe(true);
	});

	test("differing section labels don't stop a match", () => {
		const { blocks } = parseChordpro(
			`{start_of_chorus: Chorus 1}\n${CHORUS}\n{end_of_chorus}\n\n{start_of_chorus: Chorus 2}\n${CHORUS}\n{end_of_chorus}`,
		);
		const collapsed = collapseChorusBlocks(blocks);
		expect(collapsed[1].recall).toBe(true);
		// The recall keeps its own label, so "Chorus 2" still reads as the second one.
		expect(collapsed[1].label).toBe("Chorus 2");
	});

	test("verses that repeat are left alone", () => {
		const line = "Same [C]line";
		const { blocks } = parseChordpro(
			`{start_of_verse}\n${line}\n{end_of_verse}\n\n{start_of_verse}\n${line}\n{end_of_verse}`,
		);
		expect(collapseChorusBlocks(blocks).every((b) => !b.recall)).toBe(true);
	});

	test("a {chorus} recall passes through untouched", () => {
		const { blocks } = parseChordpro(
			`{start_of_chorus}\n${CHORUS}\n{end_of_chorus}\n\n{chorus}`,
		);
		expect(collapseChorusBlocks(blocks)).toEqual(blocks);
	});
});

describe("collapseChorusesInSource", () => {
	test("the repeat becomes one recall line, the first stays whole", () => {
		const out = collapseChorusesInSource(SONG);
		expect(out.match(/\{start_of_chorus\}/g)).toHaveLength(1);
		expect(out).toContain("{comment_italic: Chorus}");
		expect(out).toContain("Let it [C]be, let it [G]be");
		// Verses either side of the collapsed chorus survive in order.
		expect(out.indexOf("Verse 2")).toBeLessThan(
			out.indexOf("{comment_italic: Chorus}"),
		);
	});

	test("the recall is tagged with the chorus's own label", () => {
		const out = collapseChorusesInSource(
			`{soc: Refrén}\n${CHORUS}\n{eoc}\n\n{soc: Refrén}\n${CHORUS}\n{eoc}`,
		);
		expect(out).toContain("{comment_italic: Refrén}");
	});

	test("an unclosed chorus ends at the next section, which is kept", () => {
		const out = collapseChorusesInSource(
			`{soc}\n${CHORUS}\n\n{soc}\n${CHORUS}\n\n{start_of_verse}\nlast [C]line`,
		);
		expect(out.match(/\{soc\}/g)).toHaveLength(1);
		expect(out).toContain("{start_of_verse}");
		expect(out).toContain("last [C]line");
	});

	test("a chorus at the very end of the document collapses", () => {
		const out = collapseChorusesInSource(
			`{soc}\n${CHORUS}\n{eoc}\n\n{soc}\n${CHORUS}\n{eoc}`,
		);
		expect(out.trimEnd().endsWith("{comment_italic: Chorus}")).toBe(true);
	});

	test("a song with one chorus is returned unchanged", () => {
		const once = `{soc}\n${CHORUS}\n{eoc}\n\nverse [C]line\n`;
		expect(collapseChorusesInSource(once)).toBe(once);
	});

	test("blocks and source agree on which choruses collapse", () => {
		const fromSource = parseChordpro(collapseChorusesInSource(SONG)).blocks;
		const fromBlocks = collapseChorusBlocks(parseChordpro(SONG).blocks);
		// The source path renders its recall as a comment, which the block parser drops;
		// what has to agree is that exactly one chorus body survives in each.
		const bodies = (blocks: typeof fromBlocks) =>
			blocks.filter((b) => b.kind === "chorus" && b.lines.length > 0).length;
		expect(bodies(fromSource)).toBe(1);
		expect(bodies(fromBlocks)).toBe(1);
	});
});

describe("collapsing shortens the rendered document", () => {
	test("the height estimate counts the recall as one line, not zero", () => {
		const full = estimateSongHeight(SONG);
		const collapsed = estimateSongHeight(collapseChorusesInSource(SONG));
		expect(collapsed).toBeLessThan(full);
		// Two lyric lines and their chord rows are gone; one label line replaces them.
		expect(full - collapsed).toBeGreaterThan(20);
	});

	test("buildSetlistChordpro applies it only when asked", () => {
		const entry = { name: "Let It Be", content: SONG, capo: 0 };
		expect(buildSetlistChordpro([entry], "fingered")).not.toContain(
			"comment_italic",
		);
		expect(
			buildSetlistChordpro([entry], "fingered", { collapseChoruses: true }),
		).toContain("{comment_italic: Chorus}");
	});

	test("the concert copy is collapsed and transposed", () => {
		const doc = buildSetlistChordpro(
			[{ name: "Let It Be", content: `{capo: 2}\n${SONG}`, capo: 2 }],
			"concert",
			{ collapseChoruses: true },
		);
		expect(doc).toContain("{comment_italic: Chorus}");
		expect(doc).toContain("[D]be"); // C up two semitones
	});

	test("buildSongView collapses only when asked", () => {
		const plain = buildSongView({ content: SONG, view: "fingered" });
		const collapsed = buildSongView({
			content: SONG,
			view: "fingered",
			collapseChoruses: true,
		});
		expect(plain.blocks.some((b) => b.recall)).toBe(false);
		expect(collapsed.blocks.filter((b) => b.recall)).toHaveLength(1);
	});
});
