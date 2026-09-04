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

/**
 * Type sizes. The CLI's defaults (12pt lyrics, 1.2 line spacing) are book settings; a
 * chord sheet is read in glances off a music stand, not line by line, and every point
 * saved here is a song that stops needing a page turn. Chords keep their 10pt — they're
 * what a player actually looks for — so they now sit slightly larger than the lyrics.
 */
const FONT_SIZE = { lyrics: 11, chords: 10, label: 9, tab: 10 };
const SPACING = { lyrics: 1.1, chords: 1.1 };

/** Dark red — readable on paper in black-and-white-ish print, distinct from the lyrics. */
const CHORD_COLOR = "#8b1a1a";

/** Baseline distances: each font size times its `pdf.spacing` factor. */
export const LINE_HEIGHT = {
	lyrics: FONT_SIZE.lyrics * SPACING.lyrics,
	chords: FONT_SIZE.chords * SPACING.chords,
	/** Section labels are rendered as `comment_italic` comments, spaced as lyrics. */
	label: FONT_SIZE.label * SPACING.lyrics,
	/** `spacing.tab` is 1. */
	tab: FONT_SIZE.tab,
};

/**
 * Rough advance of one lyric character in the body font (a Times clone) — enough to
 * predict roughly where a long line wraps, not to typeset it.
 */
export const LYRIC_CHAR_WIDTH = 0.47 * FONT_SIZE.lyrics;

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
			fonts: {
				text: `serif ${FONT_SIZE.lyrics}`,
				// Chords in a dark red, so the eye finds them without hunting the italics.
				chord: `sans bold ${FONT_SIZE.chords}; color=${CHORD_COLOR}`,
				// Section labels. Spelled through the `sans` family rather than as the
				// physical "Helvetica-Oblique" the CLI's own default names: in a user config
				// that name resolves to nothing and the labels come out upright.
				comment_italic: `sans italic ${FONT_SIZE.label}`,
			},
			spacing: SPACING,
			formats: {
				// Capo after the title ("Lucie - Sen (capo 4)"), from the song's own {capo}. Concert
				// copies have had that directive stripped, so they correctly show nothing.
				title: {
					title: ["%{artist|%{} – }%{title}%{capo| (capo %{})}", "", ""],
				},
			},
		},
	};
}
