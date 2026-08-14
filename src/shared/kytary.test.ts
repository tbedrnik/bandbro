import { describe, expect, test } from "bun:test";
import { parseChordpro } from "./chordpro";
import { kytaryHtmlToChordpro, parseKytaryHtml } from "./kytary";

/** A chord span as the page emits it (root + optional suffix + optional bass). */
function chord(root: string, variant = "", bass = ""): string {
	const label =
		`<span class="scs-chk">${root}</span>` +
		(variant ? `<span class="scs-chv">${variant}</span>` : "") +
		(bass ? `/<span class="scs-chb">${bass}</span>` : "");
	return `<span class="scs-chord" orig-width="13"><span class="scs-chord-label" style="left: 0px; font-size: 18px;">${label}</span></span>`;
}

const PAGE = `<!doctype html><html><body>
<div id="desk" data-song-id="61" data-song-convention="eu">
	<div class="song-title-row"><h1 class="sheet-title">
		Amerika
	</h1></div>
	<h2 class="sheet-author"><a href="/in/lucie" class="sheet-author-link"><u>Lucie</u></a></h2>
	<div id="sheet-content"><div class="smartchordsheet"><div id="snippet--sheetContent" class="columns-2">
		<div class="scs-section" data-type="intro"><div>${chord("E", "m")}</div></div>
		<div class="scs-section" data-type="verse"><div>${chord("G")}Nandej mi ${chord("D")}do hlavy tv&#253; ${chord("A", "m")}brouky</div><div>${chord("A", "m")}a b&#367;h&nbsp;n&aacute;m seber bezna${chord("G")}d&#283;j</div></div>
		<div class="scs-section" data-type="chorus"><div>pá ${chord("G", "", "F#")}pá pá ${chord("E", "m7")}pá</div><div>${chord("G")}——${chord("E", "m")}————<br></div></div>
	</div></div></div>
</div></body></html>`;

describe("parseKytaryHtml", () => {
	const sheet = parseKytaryHtml(PAGE);

	test("reads title, artist and convention", () => {
		expect(sheet.title).toBe("Amerika");
		expect(sheet.artist).toBe("Lucie");
		expect(sheet.convention).toBe("eu");
	});

	test("inlines chords before the syllable they fall on", () => {
		expect(sheet.sections[1]).toEqual({
			type: "verse",
			lines: [
				"[G]Nandej mi [D]do hlavy tvý [Am]brouky",
				"[Am]a bůh nám seber bezna[G]děj",
			],
		});
	});

	test("keeps chord-only lines, slash chords and suffixes", () => {
		expect(sheet.sections[0]).toEqual({ type: "intro", lines: ["[Em]"] });
		expect(sheet.sections[2].lines[0]).toBe("pá [G/F#]pá pá [Em7]pá");
	});

	test("rewrites lyric brackets so they are not read as chords", () => {
		const html = PAGE.replace(
			`<div class="scs-section" data-type="intro"><div>${chord("E", "m")}</div></div>`,
			`<div class="scs-section" data-type="chorus"><div>[: Budu se ${chord("D")}dívat :] [2x]</div></div>`,
		);
		const [first] = parseKytaryHtml(html).sections;
		expect(first.lines[0]).toBe("|: Budu se [D]dívat :| (2x)");
	});

	test("drops the trailing <br> instead of emitting a blank line", () => {
		expect(sheet.sections[2].lines).toHaveLength(2);
		expect(sheet.sections[2].lines[1]).toBe("[G]——[Em]————");
	});
});

describe("kytaryHtmlToChordpro", () => {
	const chordpro = kytaryHtmlToChordpro(PAGE, {
		sourceUrl: "https://akordy.kytary.cz/song/amerika",
	});

	test("emits metadata directives", () => {
		expect(chordpro).toStartWith(
			"{title: Amerika}\n{artist: Lucie}\n{x_source: https://akordy.kytary.cz/song/amerika}\n",
		);
	});

	test("wraps sections, labelling the ones ChordPro has no directive for", () => {
		expect(chordpro).toContain("{start_of_verse: Intro}\n[Em]\n{end_of_verse}");
		expect(chordpro).toContain("{start_of_chorus}\npá [G/F#]pá pá [Em7]pá");
		expect(chordpro).toContain("{end_of_chorus}");
	});

	test("labels unknown section types with their own name", () => {
		const html = PAGE.replace('data-type="intro"', 'data-type="solo"');
		expect(kytaryHtmlToChordpro(html)).toContain("{start_of_verse: Solo}");
	});

	test("round-trips through the shared ChordPro parser", () => {
		const { meta, blocks } = parseChordpro(chordpro);
		expect(meta.title).toBe("Amerika");
		expect(meta.artist).toBe("Lucie");
		expect(blocks.map((b) => b.kind)).toEqual(["verse", "verse", "chorus"]);
		expect(blocks[0].label).toBe("Intro");
		expect(blocks[1].lines[0]).toEqual([
			{ chord: "G", text: "Nandej mi " },
			{ chord: "D", text: "do hlavy tvý " },
			{ chord: "Am", text: "brouky" },
		]);
	});
});

describe("failure modes", () => {
	test("rejects pages that are not song sheets", () => {
		expect(() => parseKytaryHtml("<html><body>nope</body></html>")).toThrow(
			/No #sheet-content/,
		);
	});

	test("keeps European names when the page is already in US convention", () => {
		const us = PAGE.replace(
			'data-song-convention="eu"',
			'data-song-convention="us"',
		).replace(
			`<div class="scs-section" data-type="intro"><div>${chord("E", "m")}</div></div>`,
			`<div class="scs-section" data-type="intro"><div>${chord("B")}</div></div>`,
		);
		expect(parseKytaryHtml(us).sections[0].lines[0]).toBe("[B]");
		expect(parseKytaryHtml(us).convention).toBe("us");
	});
});
