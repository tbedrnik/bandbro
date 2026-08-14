/**
 * Importer for akordy.kytary.cz ("SmartChords") chord sheets → ChordPro.
 *
 * The site renders no ChordPro export, but its markup is a faithful model of the
 * sheet: `#sheet-content` holds `div.scs-section[data-type]` blocks, each containing
 * one `div` per line, and every chord is a `span.scs-chord` sitting immediately
 * before the syllable it falls on:
 *
 *   <span class="scs-chord"><span class="scs-chord-label">
 *     <span class="scs-chk">A</span><span class="scs-chv">m</span>
 *   </span></span>brouky                                    →  [Am]brouky
 *
 * (`scs-chk` = root, `scs-chv` = variant/suffix, `scs-chb` = slash bass.)
 *
 * Chord names follow the page's `data-song-convention`. In the European ("eu")
 * convention `B` means B-flat and `H` means B — those are rewritten to the
 * international spelling so the shared transpose engine reads them correctly.
 *
 * Dependency-free on purpose: a small tolerant scanner over the markup, no DOM.
 */

import { internationalChord } from "./notation";

export type ChordConvention = "eu" | "us";

/** A `div.scs-section` — `type` is the raw `data-type` from the page. */
export type KytarySection = {
	type: string;
	/** Lines already in ChordPro inline form: `[G]Nandej mi [D]do hlavy…`. */
	lines: string[];
};

export type KytarySheet = {
	title?: string;
	artist?: string;
	convention: ChordConvention;
	sections: KytarySection[];
};

/**
 * `data-type` → ChordPro section. `intro`/`interlude`/`ending` have no ChordPro
 * equivalent, so they become labelled verses (which is what the reference
 * `chordpro` renderer and our own parser both handle).
 */
const SECTION_MAP: Record<string, { directive: string; label?: string }> = {
	verse: { directive: "verse" },
	chorus: { directive: "chorus" },
	bridge: { directive: "bridge" },
	tab: { directive: "tab" },
	intro: { directive: "verse", label: "Intro" },
	interlude: { directive: "verse", label: "Interlude" },
	ending: { directive: "verse", label: "Outro" },
};

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	shy: "",
	hellip: "…",
	ndash: "–",
	mdash: "—",
	rsquo: "’",
	lsquo: "‘",
	rdquo: "”",
	ldquo: "“",
};

/**
 * Latin-1 accented letters (`&aacute;`, `&ecirc;`, …). The site serves UTF-8, but
 * some pages still escape accents, and Czech text is full of them. Derived from the
 * accented characters themselves — the entity name is base letter + accent name,
 * and the base letter falls out of Unicode decomposition.
 */
for (const [accent, chars] of Object.entries({
	acute: "áéíóúý",
	grave: "àèìòù",
	circ: "âêîôû",
	uml: "äëïöüÿ",
	tilde: "ãñõ",
	ring: "å",
	cedil: "ç",
})) {
	for (const char of chars) {
		const base = char.normalize("NFD")[0];
		NAMED_ENTITIES[base + accent] = char;
		NAMED_ENTITIES[base.toUpperCase() + accent] = char.toUpperCase();
	}
}

function decodeEntities(text: string): string {
	return text
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
			String.fromCodePoint(Number.parseInt(hex, 16)),
		)
		.replace(/&#(\d+);/g, (_, dec) =>
			String.fromCodePoint(Number.parseInt(dec, 10)),
		)
		.replace(/&([a-zA-Z]+);/g, (whole, name) => {
			// Entity names are case-sensitive (&Aacute; ≠ &aacute;), with a lowercase
			// fallback for the ones listed only once.
			const replacement =
				NAMED_ENTITIES[name] ?? NAMED_ENTITIES[String(name).toLowerCase()];
			return replacement === undefined ? whole : replacement;
		})
		.replace(/\u00a0/g, " "); // NBSP → plain space
}

function stripTags(html: string): string {
	return html.replace(/<[^>]*>/g, "");
}

function tagName(tag: string): string {
	return /^<\/?\s*([a-zA-Z0-9]+)/.exec(tag)?.[1]?.toLowerCase() ?? "";
}

function attr(tag: string, name: string): string | undefined {
	const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
	return m?.[1];
}

/** Exact class-token test — `scs-chord` must not match `scs-chord-label`. */
function hasClass(tag: string, className: string): boolean {
	return (attr(tag, "class") ?? "").split(/\s+/).includes(className);
}

/**
 * Index of the `<` of the tag closing the element whose opening tag ends at
 * `from`, or -1 when the markup is unbalanced.
 */
function matchingCloseIndex(html: string, from: number, tag: string): number {
	const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
	re.lastIndex = from;
	let depth = 1;
	let m: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
	while ((m = re.exec(html)) !== null) {
		if (m[1]) {
			depth -= 1;
			if (depth === 0) return m.index;
		} else if (!m[0].endsWith("/>")) {
			depth += 1;
		}
	}
	return -1;
}

/** Every direct child element `<tag …>…</tag>` of `html`, as inner HTML. */
function childElements(html: string, tag: string): string[] {
	const open = new RegExp(`<${tag}\\b[^>]*>`, "gi");
	const children: string[] = [];
	let pos = 0;
	while (pos < html.length) {
		open.lastIndex = pos;
		const m = open.exec(html);
		if (!m) break;
		const innerStart = m.index + m[0].length;
		const close = matchingCloseIndex(html, innerStart, tag);
		if (close === -1) {
			children.push(html.slice(innerStart));
			break;
		}
		children.push(html.slice(innerStart, close));
		pos = html.indexOf(">", close) + 1 || html.length;
	}
	return children;
}

/**
 * Square brackets in the lyrics themselves would be read as chords. The site uses
 * them for repeats (`[: … :]`), which become the standard repeat barlines `|: … :|`;
 * any other stray bracket becomes a parenthesis so the line still parses.
 */
function escapeLyricBrackets(text: string): string {
	return text
		.replace(/\[:/g, "|:")
		.replace(/:\]/g, ":|")
		.replace(/\[/g, "(")
		.replace(/\]/g, ")");
}

/** One line `div` → a ChordPro line; a `<br>` splits it into several. */
function lineToChordpro(inner: string, convention: ChordConvention): string[] {
	const lines: string[] = [];
	let buf = "";
	let i = 0;
	while (i < inner.length) {
		const lt = inner.indexOf("<", i);
		if (lt === -1) {
			buf += escapeLyricBrackets(decodeEntities(inner.slice(i)));
			break;
		}
		buf += escapeLyricBrackets(decodeEntities(inner.slice(i, lt)));
		const gt = inner.indexOf(">", lt);
		if (gt === -1) break;
		const tag = inner.slice(lt, gt + 1);
		const name = tagName(tag);
		if (name === "br") {
			lines.push(buf.trimEnd());
			buf = "";
			i = gt + 1;
			continue;
		}
		if (
			name === "span" &&
			!tag.startsWith("</") &&
			hasClass(tag, "scs-chord")
		) {
			const close = matchingCloseIndex(inner, gt + 1, "span");
			const chordHtml =
				close === -1 ? inner.slice(gt + 1) : inner.slice(gt + 1, close);
			let chord = decodeEntities(stripTags(chordHtml)).trim();
			if (convention === "eu") chord = internationalChord(chord);
			if (chord) buf += `[${chord}]`;
			i =
				close === -1
					? inner.length
					: inner.indexOf(">", close) + 1 || inner.length;
			continue;
		}
		i = gt + 1;
	}
	lines.push(buf.trimEnd());
	while (lines.length && lines[lines.length - 1] === "") lines.pop();
	return lines;
}

function textOf(html: string, pattern: RegExp): string | undefined {
	const m = pattern.exec(html);
	if (!m) return undefined;
	const text = decodeEntities(stripTags(m[1])).replace(/\s+/g, " ").trim();
	return text || undefined;
}

/** Parse a fetched song page into title/artist + sections of ChordPro lines. */
export function parseKytaryHtml(
	html: string,
	opts: { convention?: ChordConvention } = {},
): KytarySheet {
	const convention =
		opts.convention ??
		(attr(html, "data-song-convention") === "us" ? "us" : "eu");

	const title = textOf(
		html,
		/<h1[^>]*class="[^"]*sheet-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
	);
	const authors = [
		...html.matchAll(
			/<a[^>]*class="[^"]*sheet-author-link[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
		),
	]
		.map((m) => decodeEntities(stripTags(m[1])).replace(/\s+/g, " ").trim())
		.filter(Boolean);
	const artist = authors.length
		? [...new Set(authors)].join(", ")
		: textOf(
				html,
				/<h2[^>]*class="[^"]*sheet-author[^"]*"[^>]*>([\s\S]*?)<\/h2>/i,
			);

	const sheetStart = html.search(/id="sheet-content"/i);
	if (sheetStart === -1) {
		throw new Error(
			"No #sheet-content found — is this an akordy.kytary.cz song page?",
		);
	}
	const sheetHtml = html.slice(sheetStart);

	const sections: KytarySection[] = [];
	const sectionOpen = /<div\b[^>]*>/gi;
	let pos = 0;
	while (pos < sheetHtml.length) {
		sectionOpen.lastIndex = pos;
		const m = sectionOpen.exec(sheetHtml);
		if (!m) break;
		pos = m.index + m[0].length;
		if (!hasClass(m[0], "scs-section")) continue;
		const close = matchingCloseIndex(sheetHtml, pos, "div");
		const inner =
			close === -1 ? sheetHtml.slice(pos) : sheetHtml.slice(pos, close);
		pos = close === -1 ? sheetHtml.length : close;
		const lines = childElements(inner, "div").flatMap((line) =>
			lineToChordpro(line, convention),
		);
		if (lines.length) {
			sections.push({
				type: (attr(m[0], "data-type") ?? "verse").toLowerCase(),
				lines,
			});
		}
	}
	if (!sections.length)
		throw new Error("#sheet-content held no .scs-section blocks");

	return { title, artist, convention, sections };
}

/** Render a parsed sheet as a ChordPro document. */
export function kytarySheetToChordpro(
	sheet: KytarySheet,
	opts: { sourceUrl?: string } = {},
): string {
	const out: string[] = [];
	if (sheet.title) out.push(`{title: ${sheet.title}}`);
	if (sheet.artist) out.push(`{artist: ${sheet.artist}}`);
	if (opts.sourceUrl) out.push(`{x_source: ${opts.sourceUrl}}`);

	for (const section of sheet.sections) {
		// Anything we don't know (the site also emits e.g. `solo`) becomes a verse
		// labelled with the section's own name, so the hint survives the import.
		const mapped =
			SECTION_MAP[section.type] ??
			({
				directive: "verse",
				label: section.type.charAt(0).toUpperCase() + section.type.slice(1),
			} as const);
		const label = mapped.label ? `: ${mapped.label}` : "";
		out.push("");
		out.push(`{start_of_${mapped.directive}${label}}`);
		out.push(...section.lines);
		out.push(`{end_of_${mapped.directive}}`);
	}

	return `${out.join("\n")}\n`;
}

/** Fetched page HTML → ChordPro. */
export function kytaryHtmlToChordpro(
	html: string,
	opts: { sourceUrl?: string; convention?: ChordConvention } = {},
): string {
	return kytarySheetToChordpro(parseKytaryHtml(html, opts), opts);
}

/**
 * The page could not be fetched (network failure, or a non-2xx response —
 * `status` then carries it). Distinct from a parse failure so callers can tell
 * "couldn't reach the page" from "that page holds no chord sheet".
 */
export class KytaryFetchError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message);
		this.name = "KytaryFetchError";
	}
}

/**
 * Fetch a song page and convert it. Separate from the parser so the conversion
 * stays pure/testable (the parser is what the server-side import reuses).
 */
export async function fetchKytaryChordpro(
	url: string,
	opts: { convention?: ChordConvention } = {},
): Promise<{ chordpro: string; sheet: KytarySheet }> {
	let res: Response;
	try {
		res = await fetch(url, {
			headers: {
				// The site 403s unknown clients; identify as a normal browser.
				"user-agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
				"accept-language": "cs,en;q=0.8",
			},
		});
	} catch (cause) {
		throw new KytaryFetchError(
			`GET ${url} failed: ${(cause as Error).message}`,
		);
	}
	if (!res.ok) {
		throw new KytaryFetchError(
			`GET ${url} → ${res.status} ${res.statusText}`,
			res.status,
		);
	}
	const html = await res.text();
	const sheet = parseKytaryHtml(html, opts);
	return { chordpro: kytarySheetToChordpro(sheet, { sourceUrl: url }), sheet };
}
