/**
 * Note-name conventions, and the conversion between them.
 *
 * Internally — ChordPro source in the DB, the transpose engine, the PDF — chords always
 * use the international convention: `B` is B natural and B-flat is `Bb`. Central-European
 * sheets name those two notes differently (`H` is B natural, `B` is B-flat), and that's
 * what BandBro shows by default: in the rendered chord sheet, in key labels, and in the
 * editor's source pane.
 *
 * Conversion happens only at the edges — when rendering, and when text enters or leaves
 * the editor — so nothing that transposes, saves or exports is affected. The chord-level
 * mappers live here; the ChordPro-text-level ones (which touch only `[chords]` and the
 * `{key}` directive, never the lyrics) are in `chordproSource.ts`.
 *
 * `convention` is threaded through as a parameter so the per-user preference we want later
 * is a matter of passing it down, not of rewriting the render path.
 */

export type NoteConvention = "european" | "international";

export const DEFAULT_NOTE_CONVENTION: NoteConvention = "european";

/**
 * International → European roots, by pitch class: B natural becomes `H`, and everything
 * that sounds as B-flat (`Bb`, and the engine's sharp spelling `A#`) becomes `B`.
 */
const TO_EUROPEAN: Record<string, string> = {
	B: "H",
	Cb: "H",
	Bb: "B",
	"A#": "B",
};

/** European → international roots: `H` is B natural, and a bare `B` means B-flat. */
const TO_INTERNATIONAL: Record<string, string> = {
	H: "B",
	Hb: "Bb",
	B: "Bb",
};

/** Apply a root mapping to a chord's root and its slash bass, leaving suffixes alone. */
function mapRoots(chord: string, roots: Record<string, string>): string {
	return chord
		.split("/")
		.map((part) => {
			const m = part.match(/^([A-H][#b]?)(.*)$/);
			if (!m) return part;
			const root = roots[m[1]];
			return root ? root + m[2] : part;
		})
		.join("/");
}

/**
 * Render a chord in the given convention, root and slash bass alike ("D/Bb" → "D/B").
 * Suffixes are untouched ("Bbmaj7" → "Bmaj7"), and anything unrecognizable — including a
 * chord someone already typed as `H` — is passed through as-is.
 */
export function displayChord(
	chord: string,
	convention: NoteConvention = DEFAULT_NOTE_CONVENTION,
): string {
	if (convention === "international" || !chord) return chord;
	return mapRoots(chord, TO_EUROPEAN);
}

/** Same conversion for a key label ("Bbm" → "Bm", "B" → "H"). */
export function displayKey(
	key: string | null | undefined,
	convention: NoteConvention = DEFAULT_NOTE_CONVENTION,
): string {
	if (!key) return "";
	return displayChord(key, convention);
}

/**
 * The inverse: a chord written in `convention` → international, so the engine and the DB
 * only ever see `B`/`Bb`. `H` → `B`, `B` → `Bb`; everything else is untouched. Used when
 * importing a European sheet (`kytary.ts`) and when the editor's text is saved.
 *
 * Note the asymmetry this creates on a round trip: `A#` displays as `B` and comes back as
 * `Bb` — the same pitch, respelled. `B` and `Bb` themselves round-trip exactly.
 */
export function internationalChord(
	chord: string,
	convention: NoteConvention = DEFAULT_NOTE_CONVENTION,
): string {
	if (convention === "international" || !chord) return chord;
	return mapRoots(chord, TO_INTERNATIONAL);
}
