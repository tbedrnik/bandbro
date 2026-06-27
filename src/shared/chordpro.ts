/**
 * Minimal, tolerant ChordPro parser shared by the editor preview, Song View, Live
 * mode and PDF export. `content` is the source of truth; this produces both the
 * render tree (blocks → ChordSheet) and the denormalized metadata persisted on the
 * Chart (key/capo/tempo/timeSignature/tags). See CLAUDE.md §D4 / §B2.
 */

/** One chord positioned above the syllable(s) it falls on. */
export type ChordSegment = { chord: string; text: string };
/** A line is a run of chord/lyric segments. */
export type ChordLine = ChordSegment[];
/** A labelled section (Verse, Chorus, Bridge) of chord lines. */
export type ChordBlock = {
	label?: string;
	kind?: SectionKind;
	lines: ChordLine[];
};

export type SectionKind = "verse" | "chorus" | "bridge" | "tab" | "none";

export type SongMeta = {
	title?: string;
	subtitle?: string;
	artist?: string;
	key?: string;
	capo?: number;
	tempo?: number;
	timeSignature?: string;
	year?: number;
	tags: string[];
};

export type ParsedSong = { meta: SongMeta; blocks: ChordBlock[] };

const SECTION_START: Record<string, SectionKind> = {
	start_of_verse: "verse",
	sov: "verse",
	start_of_chorus: "chorus",
	soc: "chorus",
	start_of_bridge: "bridge",
	sob: "bridge",
	start_of_tab: "tab",
	sot: "tab",
};

const SECTION_END = new Set([
	"end_of_verse",
	"eov",
	"end_of_chorus",
	"eoc",
	"end_of_bridge",
	"eob",
	"end_of_tab",
	"eot",
]);

const LABELS: Record<SectionKind, string> = {
	verse: "Verse",
	chorus: "Chorus",
	bridge: "Bridge",
	tab: "Tab",
	none: "",
};

function parseDirective(line: string): { name: string; value: string } | null {
	const m = line.trim().match(/^\{\s*([a-zA-Z_]+)\s*(?::\s*(.*?))?\s*\}$/);
	if (!m) return null;
	return { name: m[1].toLowerCase(), value: (m[2] ?? "").trim() };
}

/** Split a lyric line with inline [chords] into chord/text segments. */
function parseLine(line: string): ChordLine {
	const segments: ChordLine = [];
	const re = /\[([^\]]*)\]/g;
	let lastIndex = 0;
	let pendingChord = "";
	let match: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
	while ((match = re.exec(line)) !== null) {
		const text = line.slice(lastIndex, match.index);
		if (text.length > 0) {
			segments.push({ chord: pendingChord, text });
		} else if (pendingChord) {
			// two chords with no lyric between them: keep the chord on its own segment
			segments.push({ chord: pendingChord, text: "" });
		}
		pendingChord = match[1];
		lastIndex = re.lastIndex;
	}
	const tail = line.slice(lastIndex);
	segments.push({ chord: pendingChord, text: tail });
	return segments.length ? segments : [{ chord: "", text: line }];
}

export function parseChordpro(content: string): ParsedSong {
	const meta: SongMeta = { tags: [] };
	const blocks: ChordBlock[] = [];

	let current: ChordBlock | null = null;
	let lastChorus: ChordBlock | null = null;
	let inExplicitSection = false;

	const flush = () => {
		if (current?.lines.length) {
			blocks.push(current);
			if (current.kind === "chorus") lastChorus = current;
		}
		current = null;
	};

	for (const raw of content.split(/\r?\n/)) {
		const directive = parseDirective(raw);
		if (directive) {
			const { name, value } = directive;
			switch (name) {
				case "title":
				case "t":
					meta.title = value;
					break;
				case "subtitle":
				case "st":
					meta.subtitle = value;
					break;
				case "artist":
					meta.artist = value;
					break;
				case "key":
					meta.key = value;
					break;
				case "capo":
					meta.capo = Number.parseInt(value, 10) || undefined;
					break;
				case "tempo": {
					const n = Number.parseInt(value, 10);
					if (!Number.isNaN(n)) meta.tempo = n;
					break;
				}
				case "time":
					meta.timeSignature = value;
					break;
				case "year": {
					const y = Number.parseInt(value, 10);
					if (!Number.isNaN(y)) meta.year = y;
					break;
				}
				case "tags":
					meta.tags = value
						.split(",")
						.map((t) => t.trim())
						.filter(Boolean);
					break;
				case "chorus":
					if (lastChorus) blocks.push({ ...lastChorus });
					break;
				default:
					if (name in SECTION_START) {
						flush();
						const kind = SECTION_START[name];
						current = { kind, label: value || LABELS[kind], lines: [] };
						inExplicitSection = true;
					} else if (SECTION_END.has(name)) {
						flush();
						inExplicitSection = false;
					}
					break;
			}
			continue;
		}

		if (raw.trim() === "") {
			// Blank line ends an implicit paragraph but not an explicit section.
			if (!inExplicitSection) flush();
			continue;
		}

		if (!current) current = { kind: "none", lines: [] };
		current.lines.push(parseLine(raw));
	}
	flush();

	return { meta, blocks };
}

/** Just the metadata (cheap) — used on save to populate the denormalized columns. */
export function parseChordproMeta(content: string): SongMeta {
	return parseChordpro(content).meta;
}
