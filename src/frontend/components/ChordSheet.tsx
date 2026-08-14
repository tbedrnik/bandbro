import { cn } from "@frontend/lib/utils";
import type { ChordBlock, ChordLine, ChordSegment } from "@shared/chordpro";
import { displayChord } from "@shared/notation";

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
 *
 * Chord symbols are printed in the European convention (`H` for B natural, `B` for
 * B-flat) — the blocks themselves stay international. See `shared/notation.ts`.
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
			{blocks.map((block, blockIndex) =>
				// A tab is ASCII art, not lyrics: it renders verbatim in its own monospace
				// grid, and has nothing to show in lyrics-only mode.
				block.kind === "tab" ? (
					hideChords ? null : (
						<TabSection
							// biome-ignore lint/suspicious/noArrayIndexKey: positional sections
							key={blockIndex}
							block={block}
							size={chordSize}
						/>
					)
				) : (
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
						{block.lines.map((line, lineIndex) => {
							// Segments carrying a chord but no lyric ("…neposlouchaj.[D][D7]",
							// or a bare `[E][B]` interlude) have an empty lyric span, which is
							// zero-height — with `items-end` those columns would sink until
							// their chord sat *in* the lyric row. Reserve the lyric line box so
							// every column is the same height and the chords stay on the chord
							// row. A line with no lyrics at all keeps its compact chords-only
							// look, since there's no lyric row to align to.
							const hasLyrics = line.some((seg) => seg.text.trim() !== "");
							const lyricLine = lyricSize * (showChords ? 1.3 : 1.5);
							return (
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
													style={{
														fontSize: chordSize,
														minHeight: minChord,
														// Chords are packed tight so each sits over its own
														// syllable; when the next segment also has a chord,
														// keep a hair of space so they read as "D D7" and
														// never collide into "DD7".
														paddingRight: line[segIndex + 1]?.chord
															? chordSize * 0.5
															: undefined,
													}}
												>
													{displayChord(seg.chord)}
												</b>
											)}
											<span
												className="whitespace-pre text-foreground"
												style={{
													fontSize: lyricSize,
													lineHeight: showChords ? 1.3 : 1.5,
													minHeight: hasLyrics ? lyricLine : undefined,
												}}
											>
												{seg.text}
											</span>
										</span>
									))}
								</div>
							);
						})}
					</section>
				),
			)}
		</div>
	);
}

/** Section label — the small uppercase accent caption above a block. */
function SectionLabel({
	children,
	marginBottom,
}: {
	children: React.ReactNode;
	marginBottom: number;
}) {
	return (
		<div
			className="font-display font-semibold uppercase tracking-[0.12em] text-primary"
			style={{ fontSize: 12, marginBottom }}
		>
			{children}
		</div>
	);
}

/**
 * A `{start_of_tab}` section. Tablature only reads correctly on a fixed grid, so
 * every line is printed verbatim in the mono face, tight-leaded, and each chord takes
 * exactly the column width its `[chord]` marker had in the source — that's what keeps
 * the chord row lined up with the staff underneath. Long staves scroll rather than wrap.
 */
function TabSection({ block, size }: { block: ChordBlock; size: number }) {
	return (
		<section className="mb-[34px] max-w-full overflow-x-auto last:mb-0">
			{block.label && (
				<SectionLabel marginBottom={10}>{block.label}</SectionLabel>
			)}
			<div
				className="w-fit whitespace-pre font-mono text-foreground"
				style={{ fontSize: size, lineHeight: 1.35 }}
			>
				{block.lines.map((line, lineIndex) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: positional lines
					<div key={lineIndex}>
						{line.every((seg) => !seg.chord && seg.text === "")
							? " "
							: line.map((seg, segIndex) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: positional segments
									<span key={segIndex}>
										{seg.chord && (
											<span className="font-semibold text-primary">
												{tabChord(seg.chord, seg.width)}
											</span>
										)}
										{seg.text}
									</span>
								))}
					</div>
				))}
			</div>
		</section>
	);
}

/**
 * The chord as it appears in a tab: padded to the width of its source marker so the
 * columns after it don't shift. Grows only when a transposed chord no longer fits
 * (`[D]` → `D#`), and always keeps one trailing space off the next glyph.
 */
function tabChord(chord: string, width?: number) {
	const label = displayChord(chord);
	return label.padEnd(Math.max(width ?? 0, label.length + 1));
}
