import { describe, expect, test } from "bun:test";
import { parseChordpro } from "./chordpro";
import { buildSongView } from "./songView";
import { transposeChord, transposeKey, viewSteps } from "./transpose";

describe("transposeChord", () => {
	test("shifts simple major/minor roots", () => {
		expect(transposeChord("C", 2)).toBe("D");
		expect(transposeChord("Am", 2)).toBe("Bm");
		expect(transposeChord("G", 2)).toBe("A");
		expect(transposeChord("F", 2)).toBe("G");
	});

	test("PRD §7 worked example — capo 2 concert pitch", () => {
		const fingered = ["C", "G", "Am", "F"];
		const concert = fingered.map((c) => transposeChord(c, 2));
		expect(concert).toEqual(["D", "A", "Bm", "G"]);
	});

	test("wraps around the octave", () => {
		expect(transposeChord("A", -1)).toBe("G#");
		expect(transposeChord("G#", 1)).toBe("A");
		expect(transposeChord("B", 1)).toBe("C");
	});

	test("normalizes flats to sharps and keeps suffixes", () => {
		expect(transposeChord("Bb", 0)).toBe("Bb"); // no-op preserves input
		expect(transposeChord("Bbmaj7", 1)).toBe("Bmaj7");
		expect(transposeChord("Ebsus4", 2)).toBe("Fsus4");
	});

	test("handles slash chords", () => {
		expect(transposeChord("C/G", 2)).toBe("D/A");
		expect(transposeChord("D/F#", 1)).toBe("D#/G");
	});

	test("leaves non-chords untouched", () => {
		expect(transposeChord("", 5)).toBe("");
		expect(transposeChord("N.C.", 5)).toBe("N.C.");
	});

	test("section markers keep their names, note letter or not", () => {
		expect(transposeChord("Bridge", 2)).toBe("Bridge");
		expect(transposeChord("Chorus", -1)).toBe("Chorus");
		expect(transposeChord("Repeat this", 3)).toBe("Repeat this");
		expect(transposeChord("Em, G#, Eb, Bb", 1)).toBe("Em, G#, Eb, Bb");
	});

	test("Czech-style suffixes are still chords", () => {
		expect(transposeChord("Emi", 2)).toBe("F#mi");
	});
});

describe("viewSteps", () => {
	test("fingered ignores capo, concert adds it", () => {
		expect(viewSteps("fingered", 2, 0)).toBe(0);
		expect(viewSteps("concert", 2, 0)).toBe(2);
		expect(viewSteps("concert", 2, 1)).toBe(3);
		expect(viewSteps("fingered", 2, -2)).toBe(-2);
	});
});

describe("transposeKey", () => {
	test("shifts key labels", () => {
		expect(transposeKey("Am", 2)).toBe("Bm");
		expect(transposeKey("G", 1)).toBe("G#");
		expect(transposeKey(null, 2)).toBe("");
	});
});

describe("parseChordpro", () => {
	const SRC = `{title: House of the Rising Sun}
{artist: Traditional}
{key: Am}
{capo: 2}
{tempo: 76}
{time: 6/8}
{tags: folk, slow}
{start_of_verse: Verse 1}
[Am]There is a [C]house in [D]New Or[F]leans
{end_of_verse}
{start_of_chorus}
Oh [Am]mother
{end_of_chorus}`;

	test("extracts metadata", () => {
		const { meta } = parseChordpro(SRC);
		expect(meta.title).toBe("House of the Rising Sun");
		expect(meta.artist).toBe("Traditional");
		expect(meta.key).toBe("Am");
		expect(meta.capo).toBe(2);
		expect(meta.tempo).toBe(76);
		expect(meta.timeSignature).toBe("6/8");
		expect(meta.tags).toEqual(["folk", "slow"]);
	});

	test("builds labelled blocks with chord/lyric segments", () => {
		const { blocks } = parseChordpro(SRC);
		expect(blocks).toHaveLength(2);
		expect(blocks[0].label).toBe("Verse 1");
		expect(blocks[0].kind).toBe("verse");
		expect(blocks[1].kind).toBe("chorus");
		const firstSeg = blocks[0].lines[0][0];
		expect(firstSeg).toEqual({ chord: "Am", text: "There is a " });
	});

	test("{chorus} recalls the chorus rather than reprinting it", () => {
		const { blocks } = parseChordpro(
			"{soc}\nLet it [C]be\n{eoc}\n\nverse line\n\n{chorus}",
		);
		const choruses = blocks.filter((b) => b.kind === "chorus");
		expect(choruses).toHaveLength(2);
		expect(choruses[0].recall).toBeUndefined();
		expect(choruses[1]).toEqual({
			kind: "chorus",
			label: "Chorus",
			recall: true,
			lines: [],
		});
	});

	test("a recall keeps the blocks around it in order", () => {
		const { blocks } = parseChordpro(
			"{soc}\nLet it [C]be\n{eoc}\n\nverse line\n{chorus}",
		);
		expect(blocks.map((b) => b.kind)).toEqual(["chorus", "none", "chorus"]);
	});
});

describe("buildSongView", () => {
	const SRC = "{key: C}\n{capo: 2}\n[C]hello [G]world [Am]now [F]end";

	test("fingered view leaves the written shapes", () => {
		const { blocks, displayedKey, steps } = buildSongView({
			content: SRC,
			view: "fingered",
		});
		expect(steps).toBe(0);
		expect(displayedKey).toBe("C");
		expect(blocks[0].lines[0].map((s) => s.chord)).toEqual([
			"C",
			"G",
			"Am",
			"F",
		]);
	});

	test("concert view transposes up by the capo amount", () => {
		const { blocks, displayedKey, steps } = buildSongView({
			content: SRC,
			view: "concert",
		});
		expect(steps).toBe(2);
		expect(displayedKey).toBe("D");
		expect(blocks[0].lines[0].map((s) => s.chord)).toEqual([
			"D",
			"A",
			"Bm",
			"G",
		]);
	});

	test("manual transpose layers on top of the view", () => {
		const { displayedKey } = buildSongView({
			content: SRC,
			view: "concert",
			transpose: 1,
		});
		expect(displayedKey).toBe("D#");
	});
});
