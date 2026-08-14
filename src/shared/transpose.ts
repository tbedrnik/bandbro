/**
 * Transpose / capo engine — the single source of truth for shifting chords.
 *
 * Transpose (key shift) and the capo→concert translation are the *same* operation:
 * shift every chord root by N semitones. "Concert pitch" = the as-fingered chart
 * transposed UP by the capo amount, so a guitarist's capo-2 C sounds as a D for the
 * bassist. One engine → identical results in the Song View, Live mode and PDF export.
 * See CLAUDE.md §D5. Ported from the Claude Design "Song View" prototype.
 *
 * By default everything is spelled with sharps (and incoming flats are normalized to
 * sharps) — that's what the on-screen views and the PDF do. Callers that *write* the
 * result back into ChordPro source (the editor's "bake a transpose in") pass the
 * accidental the target key is conventionally spelled with, so an Eb song reads
 * "Eb/Ab/Bb" rather than "D#/G#/A#". See `keyAccidental`.
 */

import { isChord } from "./notation";

const SHARP = [
	"A",
	"A#",
	"B",
	"C",
	"C#",
	"D",
	"D#",
	"E",
	"F",
	"F#",
	"G",
	"G#",
] as const;

/** Same pitch classes as SHARP, spelled with flats. */
const FLAT = [
	"A",
	"Bb",
	"B",
	"C",
	"Db",
	"D",
	"Eb",
	"E",
	"F",
	"Gb",
	"G",
	"Ab",
] as const;

/** Which accidental a spelling uses. */
export type Accidental = "sharp" | "flat";

const FLAT_TO_SHARP: Record<string, string> = {
	Db: "C#",
	Eb: "D#",
	Gb: "F#",
	Ab: "G#",
	Bb: "A#",
	Cb: "B",
	Fb: "E",
};

/** Pitch class (index into SHARP/FLAT) of a root token, or -1 if unrecognizable. */
function rootIndex(root: string): number {
	const normalized =
		root.length === 2 && root[1] === "b" ? (FLAT_TO_SHARP[root] ?? root) : root;
	return SHARP.indexOf(normalized as (typeof SHARP)[number]);
}

/** Shift a single root token (e.g. "Am", "F#maj7", "Bb") by `steps` semitones. */
function shiftRoot(token: string, steps: number, spell: Accidental): string {
	const m = token.match(/^([A-G][#b]?)(.*)$/);
	if (!m) return token;
	const suffix = m[2];
	const idx = rootIndex(m[1]);
	if (idx === -1) return token;
	const notes = spell === "flat" ? FLAT : SHARP;
	return notes[(((idx + steps) % 12) + 12) % 12] + suffix;
}

/**
 * Transpose a full chord, handling slash chords like "C/G" and "D/F#".
 * `spell` picks the enharmonic spelling of the result (default sharps).
 *
 * Tokens that aren't chords are returned as they came in. The parser hands us everything
 * that sat between brackets, section markers included, and "Chorus" begins with a note
 * name — without the guard, transposing a song down a semitone renames it "Bhorus".
 */
export function transposeChord(
	chord: string,
	steps: number,
	spell: Accidental = "sharp",
): string {
	if (steps === 0 || !isChord(chord)) return chord;
	return chord
		.split("/")
		.map((part) => shiftRoot(part, steps, spell))
		.join("/");
}

/** The two views derived from one chart + a capo value. */
export type ChordView = "fingered" | "concert";

/**
 * Total semitone shift to apply for a given view, capo and manual transpose.
 * - fingered: the chart as written, plus any manual transpose.
 * - concert:  transposed up by the capo amount, plus any manual transpose.
 */
export function viewSteps(
	view: ChordView,
	capo: number | null | undefined,
	transpose = 0,
): number {
	const capoShift = view === "concert" ? (capo ?? 0) : 0;
	return capoShift + transpose;
}

const NOTE_INDEX: Record<string, number> = SHARP.reduce(
	(acc, note, i) => {
		acc[note] = i;
		return acc;
	},
	{} as Record<string, number>,
);

/**
 * Shift a key label (e.g. "Am" → +2 → "Bm"). Preserves a trailing "m"/"maj"
 * quality suffix; returns the input unchanged if it isn't a recognizable key.
 */
export function transposeKey(
	key: string | null | undefined,
	steps: number,
	spell: Accidental = "sharp",
): string {
	if (!key) return "";
	return transposeChord(key, steps, spell);
}

/**
 * The accidental a key is conventionally written with, by pitch class — indexed like
 * SHARP (A…G#). Eb/Bb/F/Ab/Db major and Cm/Gm/Dm/Fm/Bbm/Ebm take flats; the rest take
 * sharps. Used when baking a transpose into the source so the written chords look like
 * what a player would expect on paper.
 */
const MAJOR_ACCIDENTAL: Accidental[] = [
	"sharp", // A
	"flat", // Bb
	"sharp", // B
	"sharp", // C
	"flat", // Db
	"sharp", // D
	"flat", // Eb
	"sharp", // E
	"flat", // F
	"sharp", // F#
	"sharp", // G
	"flat", // Ab
];

const MINOR_ACCIDENTAL: Accidental[] = [
	"sharp", // Am
	"flat", // Bbm
	"sharp", // Bm
	"flat", // Cm
	"sharp", // C#m
	"flat", // Dm
	"flat", // Ebm
	"sharp", // Em
	"flat", // Fm
	"sharp", // F#m
	"flat", // Gm
	"sharp", // G#m
];

/** Sharp or flat spelling for a key label like "Eb", "Cm", "F#m". Defaults to sharps. */
export function keyAccidental(key: string | null | undefined): Accidental {
	const m = key?.trim().match(/^([A-G][#b]?)(.*)$/);
	if (!m) return "sharp";
	const idx = rootIndex(m[1]);
	if (idx === -1) return "sharp";
	const isMinor = /^m(?!aj)/i.test(m[2].trim());
	return (isMinor ? MINOR_ACCIDENTAL : MAJOR_ACCIDENTAL)[idx];
}

export { FLAT, NOTE_INDEX, SHARP };
