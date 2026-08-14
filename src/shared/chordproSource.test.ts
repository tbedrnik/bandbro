import { describe, expect, test } from "bun:test";
import {
	concertChordpro,
	displayChordproSource,
	internationalChordproSource,
	sourceKey,
	transposeChordproSource,
	transposeChordproText,
} from "./chordproSource";

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

	test("flat spelling on request", () => {
		expect(transposeChordproText("[C]x [Am]y", 3, "flat")).toBe("[Eb]x [Cm]y");
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

describe("note-name convention in the source", () => {
	const international =
		"{title: Big Bad Bill}\n{key: Bb}\n[Bb]Be [B]bold [A#]boy";
	const european = "{title: Big Bad Bill}\n{key: B}\n[B]Be [H]bold [B]boy";

	test("international → European touches chords and {key} only", () => {
		expect(displayChordproSource(international)).toBe(european);
	});

	test("European → international is what gets saved", () => {
		expect(internationalChordproSource(european)).toBe(
			"{title: Big Bad Bill}\n{key: Bb}\n[Bb]Be [B]bold [Bb]boy",
		);
	});

	test("lyrics, titles and other directives are never rewritten", () => {
		const src =
			"{title: B side}\n{artist: The Bees}\n[C]Bye bye, H is a letter";
		expect(displayChordproSource(src)).toBe(src);
		expect(internationalChordproSource(src)).toBe(src);
	});

	test("round trip preserves every chord (A# respelled as Bb)", () => {
		const src = "{key: Bb}\n[Bb]a [B]b [A#]c [Cm]d [D/B]e";
		expect(internationalChordproSource(displayChordproSource(src))).toBe(
			"{key: Bb}\n[Bb]a [B]b [Bb]c [Cm]d [D/B]e",
		);
	});

	test("the international convention leaves the text alone both ways", () => {
		expect(displayChordproSource(international, "international")).toBe(
			international,
		);
		expect(internationalChordproSource(european, "international")).toBe(
			european,
		);
	});
});

describe("brackets that aren't chords", () => {
	const src = [
		"{title: T}",
		"{key: Em}",
		"[Bridge]",
		"[Chorus]",
		"[Repeat this]",
		"[Post chorus]",
		"[Em]I walk a [G]lonely [B]road",
	].join("\n");

	test("section markers survive the editor's save round trip", () => {
		expect(displayChordproSource(src)).toBe(src.replace("[B]road", "[H]road"));
		expect(internationalChordproSource(displayChordproSource(src))).toBe(src);
	});

	test("a baked transpose leaves them alone ([Chorus] → [Bhorus])", () => {
		const out = transposeChordproText(src, -1);
		expect(out).toContain("[Chorus]");
		expect(out).toContain("[Bridge]");
		expect(out).toContain("[Repeat this]");
		expect(out).not.toContain("[Bhorus]");
		expect(out).toContain("[D#m]I walk a [F#]lonely [A#]road");
	});

	test("chords next to them still transpose", () => {
		expect(transposeChordproSource("[Bridge]\n[C]a [Am]b", 2)).toBe(
			"[Bridge]\n[D]a [Bm]b",
		);
	});
});

describe("sourceKey", () => {
	test("prefers the {key} directive", () => {
		expect(sourceKey("{key: Am}\n[C]hi")).toBe("Am");
		expect(sourceKey("{k: Eb}\n[C]hi")).toBe("Eb");
	});

	test("falls back to the first chord, root only", () => {
		expect(sourceKey("{title: T}\n[D/F#]hi [G]there")).toBe("D");
	});

	test("ignores annotations and returns undefined when there's nothing", () => {
		expect(sourceKey("{title: T}\n[*Slowly] plain lyrics")).toBeUndefined();
	});
});

describe("transposeChordproSource", () => {
	test("bakes a +3 into an imported sharp-key song (E → G)", () => {
		const src = "{title: T}\n{key: E}\n[E]a [F#m]b [C#m]c [B]d";
		const out = transposeChordproSource(src, 3);
		expect(out).toBe("{title: T}\n{key: G}\n[G]a [Am]b [Em]c [D]d");
	});

	test("spells the result for a flat target key (C → Eb)", () => {
		const out = transposeChordproSource("{key: C}\n[C]a [Am]b [F]c [G]d", 3);
		expect(out).toBe("{key: Eb}\n[Eb]a [Cm]b [Ab]c [Bb]d");
	});

	test("derives the spelling from the first chord when there's no {key}", () => {
		expect(transposeChordproSource("[C]a [F]b", 3)).toBe("[Eb]a [Ab]b");
	});

	test("minor keys use minor conventions (Am → Cm)", () => {
		const out = transposeChordproSource("{key: Am}\n[Am]a [Dm]b [E]c", 3);
		expect(out).toBe("{key: Cm}\n[Cm]a [Fm]b [G]c");
	});

	test("transposing down works and keeps the capo directive", () => {
		const src = "{key: D}\n{capo: 2}\n[D]a [A]b";
		expect(transposeChordproSource(src, -2)).toBe(
			"{key: C}\n{capo: 2}\n[C]a [G]b",
		);
	});

	test("is a no-op at 0 steps", () => {
		expect(transposeChordproSource("[C]x", 0)).toBe("[C]x");
	});
});
