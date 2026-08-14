/**
 * Helpers for producing the ChordPro source we hand to the `chordpro` CLI for
 * server-side PDF rendering (see src/backend/services/songbooksPdf.ts).
 *
 * The CLI renders chords exactly as written, so the "concert pitch" view is produced by
 * rewriting the source (`concertChordpro` in `chordproSource.ts`) with the same transpose
 * engine as the on-screen views, so the PDF matches what players see.
 */

import { concertChordpro } from "./chordproSource";

export type PdfMode = "fingered" | "concert" | "both";
export type PdfSongEntry = { name: string; content: string; capo: number };

/** Ensure a ChordPro section declares a title, and tag the title for "both" mode. */
function withTitle(content: string, name: string, suffix = ""): string {
	return /\{(title|t)\s*:/i.test(content)
		? content.replace(
				/\{(title|t)\s*:\s*([^}]*)\}/i,
				(_m, d, t) => `{${d}: ${t.trim()}${suffix}}`,
			)
		: `{title: ${name}${suffix}}\n${content}`;
}

/**
 * Build one ChordPro document for a whole setlist. Songs are separated by {new_song}
 * so the `chordpro` CLI paginates one song per page and builds a table of contents.
 * For "both", a capo'd song appears twice — as-fingered, then concert.
 */
export function buildSetlistChordpro(
	songs: PdfSongEntry[],
	mode: PdfMode,
): string {
	const sections: string[] = [];
	for (const s of songs) {
		if (mode === "fingered" || mode === "both") {
			sections.push(withTitle(s.content, s.name));
		}
		if (
			(mode === "concert" || mode === "both") &&
			(mode !== "both" || s.capo > 0)
		) {
			sections.push(
				withTitle(
					concertChordpro(s.content, s.capo),
					s.name,
					mode === "both" ? " (concert)" : "",
				),
			);
		}
	}
	return sections.join("\n\n{new_song}\n\n");
}
