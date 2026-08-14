/**
 * Rewrites of ChordPro *source* text (as opposed to the parsed render tree in
 * `chordpro.ts`). Used in two places:
 *
 * - PDF export (`chordproPdf.ts` / `songbooksPdf.ts`): the `chordpro` CLI renders chords
 *   exactly as written, so the "concert pitch" view is produced by rewriting the source.
 * - The editor's **bake a transpose in** action: unlike the view-level transpose stepper,
 *   this permanently rewrites the chords a song is written with (CLAUDE.md §D5 — same
 *   engine, applied to the text instead of the render).
 * - The editor's note-name convention: the source pane shows/accepts European names and
 *   the international spelling is what gets saved (§D11).
 */

import {
	DEFAULT_NOTE_CONVENTION,
	displayChord,
	internationalChord,
	isChord,
	type NoteConvention,
} from "./notation";
import {
	type Accidental,
	keyAccidental,
	transposeChord,
	transposeKey,
} from "./transpose";

/** Inline chords: [C] [Am] [D/F#]. Annotations like [*text] are excluded. */
const INLINE_CHORD = /\[([^\]*][^\]]*)\]/g;
const KEY_DIRECTIVE = /\{(key|k)\s*:\s*([^}]+)\}/gi;

/**
 * Apply `fn` to every inline [chord] and to the {key} directive's value — and to nothing
 * else, so lyrics (where a stray "B" is just a letter) and every other directive are safe.
 *
 * Not every bracket holds a chord: section markers ("[Bridge]") and performance notes
 * ("[Repeat this]") share the syntax, and their first letter is often a note name. Those
 * are copied through verbatim rather than fed to `fn` — otherwise a save or a baked
 * transpose rewrites them ("[Chorus]" → "[Bhorus]").
 */
function mapChordproChords(
	content: string,
	fn: (chord: string) => string,
): string {
	const map = (token: string) => (isChord(token) ? fn(token) : token);
	return content
		.replace(INLINE_CHORD, (_m, chord) => `[${map(chord)}]`)
		.replace(KEY_DIRECTIVE, (_m, dir, key) => `{${dir}: ${map(key.trim())}}`);
}

/**
 * Transpose every inline [chord] and the {key} directive in ChordPro text by `steps`.
 * `spell` picks the enharmonic spelling of the result (default sharps).
 */
export function transposeChordproText(
	content: string,
	steps: number,
	spell: Accidental = "sharp",
): string {
	if (steps === 0) return content;
	return mapChordproChords(content, (chord) =>
		transposeChord(chord, steps, spell),
	);
}

/**
 * International ChordPro source → the display convention (European by default), for the
 * editor's source pane: `[B]` → `[H]`, `[Bb]`/`[A#]` → `[B]`, `{key: Bb}` → `{key: B}`.
 */
export function displayChordproSource(
	content: string,
	convention: NoteConvention = DEFAULT_NOTE_CONVENTION,
): string {
	if (convention === "international") return content;
	return mapChordproChords(content, (chord) => displayChord(chord, convention));
}

/**
 * The inverse — what the editor saves: `[H]` → `[B]`, `[B]` → `[Bb]`, `{key: H}` →
 * `{key: B}`. `B`/`Bb` round-trip exactly; `A#` comes back as the equivalent `Bb`.
 */
export function internationalChordproSource(
	content: string,
	convention: NoteConvention = DEFAULT_NOTE_CONVENTION,
): string {
	if (convention === "international") return content;
	return mapChordproChords(content, (chord) =>
		internationalChord(chord, convention),
	);
}

/** Remove the {capo} directive (used once chords are already in concert pitch). */
export function stripCapoDirective(content: string): string {
	return content
		.replace(/^\s*\{capo\s*:[^}]*\}\s*$/gim, "")
		.replace(/\n{3,}/g, "\n\n");
}

/**
 * The concert-pitch ChordPro for a chart: transpose up by `capo`, drop {capo}.
 * Returns the content unchanged when there's no capo.
 */
export function concertChordpro(content: string, capo: number): string {
	if (!capo) return content;
	return stripCapoDirective(transposeChordproText(content, capo));
}

/**
 * The key a source is written in: the {key} directive, else the first inline chord
 * (a decent proxy — most sheets open on the tonic).
 */
export function sourceKey(content: string): string | undefined {
	const key = content.match(/\{(?:key|k)\s*:\s*([^}]+)\}/i)?.[1]?.trim();
	if (key) return key;
	const chord = content.match(/\[([^\]*][^\]]*)\]/)?.[1]?.trim();
	return chord?.split("/")[0] || undefined;
}

/**
 * Bake a transpose into the source: every chord and the {key} directive are rewritten,
 * spelled the way the *target* key is conventionally written (so +3 from C gives
 * Eb/Ab/Bb, not D#/G#/A#). {capo} is left alone — a capo is a physical position, not a
 * property of the written chords.
 */
export function transposeChordproSource(
	content: string,
	steps: number,
): string {
	if (steps === 0) return content;
	const target = transposeKey(sourceKey(content), steps);
	return transposeChordproText(content, steps, keyAccidental(target));
}
