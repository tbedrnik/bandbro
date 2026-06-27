import { cn } from "@frontend/lib/utils";

/** One chord positioned above the syllable it falls on. */
export type ChordSegment = { chord: string; text: string };
/** A line is a run of chord/lyric segments. */
export type ChordLine = ChordSegment[];
/** A labelled section (Verse, Chorus, …) of chord lines. */
export type ChordBlock = { label?: string; lines: ChordLine[] };

type Props = {
	blocks: ChordBlock[];
	/** Lyric font size in px. */
	lyricSize?: number;
	/** Chord font size in px. */
	chordSize?: number;
	className?: string;
};

/**
 * The atomic Song View component — lyrics with chord symbols sitting above the
 * words, as a chord sheet. Ported from Claude Design "ChordSheet.dc.html"; the
 * hero of the whole app, reused by the editor preview, song view and Live mode.
 */
export function ChordSheet({
	blocks,
	lyricSize = 21,
	chordSize = 15,
	className,
}: Props) {
	const minChord = Math.round(chordSize * 1.4);

	return (
		<div className={cn("font-sans", className)}>
			{blocks.map((block, blockIndex) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: positional sections
				<section key={blockIndex} className="mb-[34px] last:mb-0">
					{block.label && (
						<div className="mb-3 font-display text-xs font-semibold uppercase tracking-[0.12em] text-primary">
							{block.label}
						</div>
					)}
					{block.lines.map((line, lineIndex) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: positional lines
							key={lineIndex}
							className="mb-[9px] flex flex-wrap items-end gap-x-0 gap-y-1.5"
						>
							{line.map((seg, segIndex) => (
								<span
									// biome-ignore lint/suspicious/noArrayIndexKey: positional segments
									key={segIndex}
									className="inline-flex flex-col justify-end"
								>
									<b
										className="whitespace-pre font-mono font-semibold leading-[1.35] text-primary"
										style={{ fontSize: chordSize, minHeight: minChord }}
									>
										{seg.chord}
									</b>
									<span
										className="whitespace-pre leading-[1.3] text-foreground"
										style={{ fontSize: lyricSize }}
									>
										{seg.text}
									</span>
								</span>
							))}
						</div>
					))}
				</section>
			))}
		</div>
	);
}
