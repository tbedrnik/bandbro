/**
 * Helpers for producing the ChordPro source we hand to the `chordpro` CLI for
 * server-side PDF rendering (see src/backend/services/songbooksPdf.ts).
 *
 * The CLI renders chords exactly as written, so the "concert pitch" view is produced by
 * rewriting the source (`concertChordpro` in `chordproSource.ts`) with the same transpose
 * engine as the on-screen views, so the PDF matches what players see.
 */

import { parseChordpro } from "./chordpro";
import {
	columnWidth,
	LINE_HEIGHT,
	LYRIC_CHAR_WIDTH,
	PAGE_BODY_HEIGHT,
	TAB_CHAR_WIDTH,
} from "./chordproConfig";
import { concertChordpro } from "./chordproSource";
import { collapseChorusesInSource } from "./chorusCollapse";

export type PdfMode = "fingered" | "concert" | "both";
export type PdfSongEntry = { name: string; content: string; capo: number };

/** Per-export layout choices that aren't the render mode. */
export type PdfOptions = {
	/**
	 * Print a repeated, identical chorus as a one-line recall (CLAUDE.md §D23). Off by
	 * default: on paper the recall can land pages away from the chorus it points at,
	 * which is a worse trade than the page it saved.
	 */
	collapseChoruses?: boolean;
};

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
 * Estimated height in points of a song's rendered body at the given column count. Models
 * the CLI's line heights (see `chordproConfig.ts`): a row per lyric line, another above it
 * when the line carries chords, one per section label, and extra rows where a line is too
 * long for the column and wraps.
 */
export function estimateSongHeight(content: string, columns = 1): number {
	const perLine = Math.max(
		1,
		Math.floor(columnWidth(columns) / LYRIC_CHAR_WIDTH),
	);
	// `{comment}` and friends render as a line of their own but carry no chords or
	// lyrics, so the block parser drops them — including the chorus recalls the collapse
	// of §D23 writes, which would otherwise estimate as nothing at all.
	let height = countComments(content) * LINE_HEIGHT.label;
	for (const block of parseChordpro(content).blocks) {
		if (block.label) height += LINE_HEIGHT.label;
		for (const line of block.lines) {
			const chords = line.some((segment) => segment.chord);
			if (block.kind === "tab") {
				// Verbatim: chordpro doesn't reflow tab, so a wide staff overflows the
				// column rather than wrapping onto extra rows.
				height += LINE_HEIGHT.tab + (chords ? LINE_HEIGHT.chords : 0);
				continue;
			}
			const text = line.map((segment) => segment.text).join("");
			const rows = Math.max(1, Math.ceil(text.length / perLine));
			// A wrapped line's chords all sit on the one row above it.
			height += rows * LINE_HEIGHT.lyrics + (chords ? LINE_HEIGHT.chords : 0);
		}
	}
	return height;
}

const COMMENT_LINE =
	/^[ \t]*\{[ \t]*(?:comment|c|comment_italic|ci|comment_box|cb)[ \t]*:[^}]*\}[ \t]*$/gim;

/** How many standalone comment lines the source prints. */
function countComments(content: string): number {
	return content.match(COMMENT_LINE)?.length ?? 0;
}

/** Width in points of the widest verbatim (tab) line, which chordpro won't reflow. */
function widestTabLine(content: string): number {
	let widest = 0;
	for (const block of parseChordpro(content).blocks) {
		if (block.kind !== "tab") continue;
		for (const line of block.lines) {
			const chars = line.reduce((n, segment) => n + segment.text.length, 0);
			widest = Math.max(widest, chars * TAB_CHAR_WIDTH);
		}
	}
	return widest;
}

/**
 * Two columns keep a long song on one page at the cost of half the line width, so they're
 * worth it in exactly one case: one column spills onto a second page and two columns don't.
 * A song too long for even two columns reads better full-width over two pages, and one
 * whose tab staves are wider than a column would have them clipped — chordpro renders
 * verbatim lines as written rather than reflowing them.
 */
export function needsTwoColumns(content: string): boolean {
	if (estimateSongHeight(content, 1) <= PAGE_BODY_HEIGHT) return false;
	if (estimateSongHeight(content, 2) > 2 * PAGE_BODY_HEIGHT) return false;
	return widestTabLine(content) <= columnWidth(2);
}

/** `{columns}` is scoped to the song it appears in, so put it right after the title. */
function withTwoColumns(content: string): string {
	if (/\{columns\b/i.test(content)) return content; // the author already chose
	return content.replace(
		/\{(?:title|t)\s*:[^}]*\}/i,
		(title) => `${title}\n{columns: 2}`,
	);
}

/** Title the song, then set it in two columns if one won't hold it. */
function laidOut(content: string, name: string, suffix = ""): string {
	const titled = withTitle(content, name, suffix);
	return needsTwoColumns(titled) ? withTwoColumns(titled) : titled;
}

/**
 * Build one ChordPro document for a whole setlist. Songs are separated by {new_song}
 * so the `chordpro` CLI paginates one song per page and builds a table of contents.
 * For "both", a capo'd song appears twice — as-fingered, then concert.
 */
export function buildSetlistChordpro(
	songs: PdfSongEntry[],
	mode: PdfMode,
	{ collapseChoruses = false }: PdfOptions = {},
): string {
	const sections: string[] = [];
	for (const s of songs) {
		// Collapse first, so the two-column and page-fit estimates in `laidOut` reason
		// about the document that will actually be printed — the whole point being that
		// a shorter song stops needing a second column or a second page.
		const content = collapseChoruses
			? collapseChorusesInSource(s.content)
			: s.content;
		if (mode === "fingered" || mode === "both") {
			sections.push(laidOut(content, s.name));
		}
		if (
			(mode === "concert" || mode === "both") &&
			(mode !== "both" || s.capo > 0)
		) {
			sections.push(
				laidOut(
					concertChordpro(content, s.capo),
					s.name,
					mode === "both" ? " (concert)" : "",
				),
			);
		}
	}
	return sections.join("\n\n{new_song}\n\n");
}
