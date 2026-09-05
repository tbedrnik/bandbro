/**
 * Chorus collapse (CLAUDE.md §D23) — print the first chorus in full and replace every
 * later chorus that is *identical* with a one-line "Chorus" recall.
 *
 * A chorus is typically the longest section of a song and typically appears three or
 * four times, so this is the single biggest thing that decides whether a chart lands on
 * one page (PDF) or one screen (Live mode). It is off by default and toggled per export
 * and per device, because the trade is real: on paper the recall can end up pages away
 * from the chorus it refers to.
 *
 * Two entry points, because the two surfaces consume different things: the on-screen
 * renderers go through `parseChordpro` → blocks, while the PDF hands *source text* to the
 * `chordpro` CLI. Both compare the same signature, so they collapse the same choruses.
 *
 * Only sections explicitly marked as choruses (`{start_of_chorus}` / `{soc}`) take part.
 * A chart whose choruses are just blank-line-separated paragraphs has nothing to match
 * on, and guessing at repeated verses would collapse things that only look alike.
 */

import type { ChordBlock, ChordLine } from "./chordpro";

/** The recall directive written into the source for the CLI, whose font we configure. */
const RECALL_DIRECTIVE = "comment_italic";

/** Default tag for a recall whose chorus carried no label of its own. */
const DEFAULT_LABEL = "Chorus";

const CHORUS_START =
	/^\s*\{\s*(?:start_of_chorus|soc)\s*(?::\s*(.*?)\s*)?\}\s*$/i;
const CHORUS_END = /^\s*\{\s*(?:end_of_chorus|eoc)\s*\}\s*$/i;
const SECTION_START = /^\s*\{\s*(?:start_of_\w+|soc|sov|sob|sot)\b/i;

/**
 * The comparison key for a chorus body: its lines with trailing whitespace and blank
 * lines removed. Deliberately strict about everything else — a chorus that differs by a
 * single word is a different chorus and must be printed, which is the whole reason this
 * matches on content rather than on the section label.
 */
export function chorusSignature(lines: string[]): string {
	return lines
		.map((line) => line.trimEnd())
		.filter((line) => line !== "")
		.join("\n");
}

/** A parsed line back as ChordPro source, so blocks and source produce the same key. */
function lineToSource(line: ChordLine): string {
	return line
		.map(
			(segment) => (segment.chord ? `[${segment.chord}]` : "") + segment.text,
		)
		.join("");
}

/**
 * Replace every repeat of an earlier, identical chorus with a recall block — a label and
 * no lines, which `<ChordSheet>` renders as the section's name inside the chorus rule.
 */
export function collapseChorusBlocks(blocks: ChordBlock[]): ChordBlock[] {
	const seen = new Set<string>();
	return blocks.map((block) => {
		if (block.kind !== "chorus" || block.recall || block.lines.length === 0) {
			return block;
		}
		const signature = chorusSignature(block.lines.map(lineToSource));
		if (!signature) return block;
		if (!seen.has(signature)) {
			seen.add(signature);
			return block;
		}
		return {
			kind: "chorus" as const,
			label: block.label || DEFAULT_LABEL,
			recall: true,
			lines: [],
		};
	});
}

/**
 * The same collapse over ChordPro source, for the `chordpro` CLI. A repeated chorus —
 * start directive, body and end directive — becomes a single `{comment_italic: Chorus}`,
 * which the CLI sets in the same italic face as our section labels.
 *
 * A chorus that never closes runs to the next section directive or to the end of the
 * document, matching how `parseChordpro` treats one.
 */
export function collapseChorusesInSource(content: string): string {
	const lines = content.split("\n");
	const out: string[] = [];
	const seen = new Set<string>();

	for (let i = 0; i < lines.length; i++) {
		const start = lines[i].match(CHORUS_START);
		if (!start) {
			out.push(lines[i]);
			continue;
		}

		// Collect the body, and note whether an explicit end directive closed it — an
		// implicit end belongs to the *next* section and must not be swallowed.
		const body: string[] = [];
		let end = i + 1;
		let closed = false;
		while (end < lines.length) {
			if (CHORUS_END.test(lines[end])) {
				closed = true;
				break;
			}
			if (SECTION_START.test(lines[end])) break;
			body.push(lines[end]);
			end++;
		}

		const signature = chorusSignature(body);
		if (signature && seen.has(signature)) {
			out.push(`{${RECALL_DIRECTIVE}: ${start[1] || DEFAULT_LABEL}}`);
		} else {
			if (signature) seen.add(signature);
			out.push(lines[i], ...body);
			if (closed) out.push(lines[end]);
		}
		// `end` indexes the end directive (consumed above) or the line after the body.
		i = closed ? end : end - 1;
	}

	return out.join("\n");
}
