/**
 * The `chordpro` CLI configuration we render setlist PDFs with, plus the A4 page geometry
 * the two-column decision in `chordproPdf.ts` reasons about. See CLAUDE.md §D8.
 *
 * The CLI's stock defaults don't suit a setlist: songs are aligned to right-hand pages (so
 * a blank filler page sits between most songs), section labels are set in a left margin
 * that eats a sixth of the line width, and both tables of contents land at the front.
 *
 * The geometry constants below mirror the config values they sit next to, so the height
 * estimate and the config we hand the CLI can't drift apart.
 */

/** A4, in PostScript points — chordpro's own unit. */
const PAGE_WIDTH = 595;
const MARGIN_SIDE = 40;
/** `pdf.columnspace`: the gutter between columns. */
const COLUMN_SPACE = 20;

/**
 * Usable height for a song's body on a page: A4's 842pt less the 80/40pt top and bottom
 * margins, minus a little slack. Calibrated against the CLI with the config below — a
 * 720pt body fits on one page, a 734pt one spills onto a second. (Chord diagrams would
 * claim ~60pt of this; we turn them off.)
 */
export const PAGE_BODY_HEIGHT = 715;

/** Baseline distances: chordpro's default font sizes times their `pdf.spacing` factors. */
export const LINE_HEIGHT = {
	/** `pdf.fonts.text` "serif 12" × `spacing.lyrics` 1.2. */
	lyrics: 14.4,
	/** `pdf.fonts.chord` "sans italic 10" × `spacing.chords` 1.2. */
	chords: 12,
	/** Section labels, rendered as `pdf.fonts.comment_italic` 12 comments. */
	label: 14.4,
	/** `pdf.fonts.tab` "mono 10" × `spacing.tab` 1. */
	tab: 10,
};

/**
 * Rough advance of one lyric character in the body font (Times-Roman 12) — enough to
 * predict roughly where a long line wraps, not to typeset it.
 */
export const LYRIC_CHAR_WIDTH = 5.6;

/** Advance of one character in the tab font (Courier 10) — monospaced, so this is exact. */
export const TAB_CHAR_WIDTH = 6;

/** Width available to a line of lyrics when the song is set in `columns` columns. */
export function columnWidth(columns: number): number {
	const text = PAGE_WIDTH - 2 * MARGIN_SIDE;
	return (text - (columns - 1) * COLUMN_SPACE) / columns;
}

/**
 * Setlist order, then an index by title. Both sit at the front — the CLI has no way to put
 * one at the back, and lifting its pages there afterwards breaks their links to the songs.
 * The stock third table (by artist) is dropped.
 */
const CONTENTS = [
	{
		name: "toc",
		fields: ["songindex"],
		label: "Table of Contents",
		line: "%{title}",
		pageno: "%{page}",
	},
	{
		name: "bytitle",
		fields: ["title", "artist"],
		label: "Contents by Title",
		line: "%{title}%{artist| - %{}}",
		pageno: "%{page}",
	},
];

/** The config JSON handed to `chordpro --config`. */
export function chordproConfig(): Record<string, unknown> {
	return {
		contents: CONTENTS,
		pdf: {
			papersize: "a4",
			labels: {
				// Section labels ("Verse 1", "Riff") as an italic comment above their
				// section instead of in a left margin, which reclaims ~65pt of line width.
				width: 0,
				comment: "comment_italic",
			},
			songbook: {
				// Stock chordpro is duplex — every song starts on a right-hand page, so most
				// songs are preceded by a blank filler page. A setlist is read as singles.
				"dual-pages": false,
			},
			// No chord-diagram strip along the bottom of each song: a band knows its shapes,
			// and the strip claims ~60pt of every page (see PAGE_BODY_HEIGHT).
			diagrams: { show: false },
			kbdiagrams: { show: false },
		},
	};
}
