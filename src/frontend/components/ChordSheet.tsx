import { cn } from "@frontend/lib/utils";
import type { ChordBlock, ChordLine, ChordSegment } from "@shared/chordpro";

// Re-exported for components that import the block types alongside <ChordSheet>.
export type { ChordBlock, ChordLine, ChordSegment };

type Props = {
	blocks: ChordBlock[];
	/** Lyric font size in px. */
	lyricSize?: number;
	/** Chord font size in px. */
	chordSize?: number;
	/** Hide the chord row entirely (fan "Lyrics only" mode). */
	hideChords?: boolean;
	/**
	 * Text alignment. Always keep chord charts left-aligned so chords sit over their
	 * syllable; centering is only ever used for lyrics-only mode.
	 */
	align?: "left" | "center";
	className?: string;
};

/**
 * The atomic Song View component — lyrics with chord symbols sitting above the
 * words, as a chord sheet. Ported from Claude Design "ChordSheet.dc.html"; the
 * hero of the whole app, reused by the editor preview, song view, Live mode and the
 * public fan view.
 */
export function ChordSheet({
	blocks,
	lyricSize = 21,
	chordSize = 15,
	hideChords = false,
	align = "left",
	className,
}: Props) {
	const showChords = !hideChords;
	const center = align === "center";
	const minChord = Math.round(chordSize * 1.4);

	return (
		<div className={cn("font-sans", center && "text-center", className)}>
			{blocks.map((block, blockIndex) => (
				<section
					// biome-ignore lint/suspicious/noArrayIndexKey: positional sections
					key={blockIndex}
					className={cn(
						"last:mb-0",
						!center &&
							block.kind === "chorus" &&
							"border-l-2 border-l-primary/40 pl-4",
					)}
					style={{ marginBottom: showChords ? 34 : 26 }}
				>
					{block.label && (
						<div
							className="font-display font-semibold uppercase tracking-[0.12em] text-primary"
							style={{ fontSize: 12, marginBottom: showChords ? 12 : 9 }}
						>
							{block.label}
						</div>
					)}
					{block.lines.map((line, lineIndex) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: positional lines
							key={lineIndex}
							className={cn(
								"flex flex-wrap items-end gap-x-0 gap-y-1.5",
								center && "justify-center",
							)}
							style={{ marginBottom: showChords ? 9 : 5 }}
						>
							{line.map((seg, segIndex) => (
								<span
									// biome-ignore lint/suspicious/noArrayIndexKey: positional segments
									key={segIndex}
									className="inline-flex flex-col justify-end"
								>
									{showChords && (
										<b
											className="whitespace-pre font-mono font-semibold leading-[1.35] text-primary"
											style={{ fontSize: chordSize, minHeight: minChord }}
										>
											{seg.chord}
										</b>
									)}
									<span
										className="whitespace-pre text-foreground"
										style={{
											fontSize: lyricSize,
											lineHeight: showChords ? 1.3 : 1.5,
										}}
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
