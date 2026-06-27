/**
 * "Two views from one chart" — given a ChordPro chart plus a capo value, a manual
 * transpose offset and the chosen view, produce the render-ready blocks and the
 * displayed key. The single helper every chord-sheet surface calls. See CLAUDE.md §B3.
 */

import { type ChordBlock, parseChordpro, type SongMeta } from "./chordpro";
import {
	type ChordView,
	transposeChord,
	transposeKey,
	viewSteps,
} from "./transpose";

export type SongViewInput = {
	content: string;
	/** Capo value; falls back to the {capo} directive in `content` when omitted. */
	capo?: number | null;
	/** Manual key shift in semitones, layered on top of the view. */
	transpose?: number;
	view: ChordView;
};

export type SongViewResult = {
	meta: SongMeta;
	blocks: ChordBlock[];
	/** Total semitones applied (capo offset for concert view + manual transpose). */
	steps: number;
	/** Key after applying `steps`, if the chart declares one. */
	displayedKey: string;
	capo: number;
};

function transposeBlocks(blocks: ChordBlock[], steps: number): ChordBlock[] {
	if (steps === 0) return blocks;
	return blocks.map((block) => ({
		...block,
		lines: block.lines.map((line) =>
			line.map((seg) => ({ ...seg, chord: transposeChord(seg.chord, steps) })),
		),
	}));
}

export function buildSongView({
	content,
	capo,
	transpose = 0,
	view,
}: SongViewInput): SongViewResult {
	const { meta, blocks } = parseChordpro(content);
	const effectiveCapo = capo ?? meta.capo ?? 0;
	const steps = viewSteps(view, effectiveCapo, transpose);
	return {
		meta,
		blocks: transposeBlocks(blocks, steps),
		steps,
		displayedKey: transposeKey(meta.key, steps),
		capo: effectiveCapo,
	};
}
