/**
 * Transpose / capo engine — the single source of truth for shifting chords.
 *
 * Transpose (key shift) and the capo→concert translation are the *same* operation:
 * shift every chord root by N semitones. "Concert pitch" = the as-fingered chart
 * transposed UP by the capo amount, so a guitarist's capo-2 C sounds as a D for the
 * bassist. One engine → identical results in the Song View, Live mode and PDF export.
 * See CLAUDE.md §D5. Ported from the Claude Design "Song View" prototype.
 *
 * v1 spells everything with sharps (and normalizes incoming flats to sharps). Key-aware
 * enharmonic spelling (Bb vs A#) is a deliberate later refinement.
 */

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

const FLAT_TO_SHARP: Record<string, string> = {
	Db: "C#",
	Eb: "D#",
	Gb: "F#",
	Ab: "G#",
	Bb: "A#",
	Cb: "B",
	Fb: "E",
};

/** Shift a single root token (e.g. "Am", "F#maj7", "Bb") by `steps` semitones. */
function shiftRoot(token: string, steps: number): string {
	const m = token.match(/^([A-G][#b]?)(.*)$/);
	if (!m) return token;
	let root = m[1];
	const suffix = m[2];
	if (root.length === 2 && root[1] === "b") root = FLAT_TO_SHARP[root] ?? root;
	const idx = SHARP.indexOf(root as (typeof SHARP)[number]);
	if (idx === -1) return token;
	return SHARP[(((idx + steps) % 12) + 12) % 12] + suffix;
}

/** Transpose a full chord, handling slash chords like "C/G" and "D/F#". */
export function transposeChord(chord: string, steps: number): string {
	if (!chord?.trim()) return chord;
	if (steps === 0) return chord;
	return chord
		.split("/")
		.map((part) => shiftRoot(part, steps))
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
): string {
	if (!key) return "";
	return transposeChord(key, steps);
}

export { NOTE_INDEX, SHARP };
