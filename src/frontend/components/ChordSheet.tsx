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
	 * Vertical-rhythm multiplier for every gap (between lines, sections and a section
	 * and its label). `1` is the design's spacing; below that the sheet packs tighter,
	 * which is how Live mode fits a long song on one screen. Font sizes and the
	 * chord/lyric alignment are unaffected.
	 */
	gap?: number;
	/**
	 * Lay the sheet out in this many CSS columns. Sections never break across a column,
	 * so two columns halve the height of a long song — the other half of fitting an
	 * iPad screen. Tabs stay in one piece and scroll if a staff is wider than a column.
	 */
	columns?: number;
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
	gap = 1,
	columns = 1,
	align = "left",
	className,
}: Props) {
	const showChords = !hideChords;
	const center = align === "center";
	const minChord = Math.round(chordSize * 1.4);
	// The vertical rhythm is proportional to the type size — the ratios below reproduce the
	// design's absolute spacing (34 / 12 / 9 / 6) at the default 21px lyric. Keeping it
	// proportional is what makes shrinking the text actually shrink the sheet: with fixed
	// gaps, a song with a dozen sections carries hundreds of px that never get smaller,
	// and "fit to screen" bottoms out long before the song fits.
	const sectionGap = Math.round(lyricSize * (showChords ? 1.62 : 1.24) * gap);
	const labelGap = Math.round(lyricSize * (showChords ? 0.57 : 0.43) * gap);
	const lineGap = Math.round(lyricSize * (showChords ? 0.43 : 0.24) * gap);
	const wrapGap = Math.round(lyricSize * 0.29 * gap);
	const labelSize = Math.max(9, Math.round(lyricSize * 0.57));

	return (
		<div
			className={cn("font-sans", center && "text-center", className)}
			style={
				columns > 1
					? { columnCount: columns, columnGap: Math.round(lyricSize * 1.6) }
					: undefined
			}
		>
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
							marginBottom={sectionGap}
							labelGap={labelGap}
							labelSize={labelSize}
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
						style={{ marginBottom: sectionGap, breakInside: "avoid" }}
					>
						{block.label && (
							<SectionLabel marginBottom={labelGap} fontSize={labelSize}>
								{block.label}
							</SectionLabel>
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
							const { parts, groups } = wordGroups(line);
							return (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: positional lines
									key={lineIndex}
									className={cn(
										"flex flex-wrap items-end gap-x-0",
										center && "justify-center",
									)}
									style={{ marginBottom: lineGap, rowGap: wrapGap }}
								>
									{groups.map((group, groupIndex) => (
										<span
											// biome-ignore lint/suspicious/noArrayIndexKey: positional groups
											key={groupIndex}
											className="inline-flex items-end"
										>
											{group.map(({ part, index: partIndex }) => (
												<span
													key={partIndex}
													className="inline-flex flex-col justify-end"
												>
													{showChords && (
														<b
															className="whitespace-pre font-mono font-semibold leading-[1.35] text-primary"
															style={{
																fontSize: chordSize,
																minHeight: minChord,
																// Chords are packed tight so each sits over its own
																// syllable; when the next part also has a chord,
																// keep a hair of space so they read as "D D7" and
																// never collide into "DD7".
																paddingRight: parts[partIndex + 1]?.chord
																	? chordSize * 0.5
																	: undefined,
																// A chord wider than its own word overhangs the words
																// that follow it (there's no chord there to hit), the
																// way it did before the line was cut into words —
																// otherwise `[Em]I walk` would stretch "I" to Em's
																// width and open a hole in the lyric.
																...(overhangs(parts, partIndex) && {
																	width: 0,
																}),
															}}
														>
															{displayChord(part.chord)}
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
														{part.text}
													</span>
												</span>
											))}
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

/**
 * Whether this part's chord may stick out past its own word: true when the next part
 * exists and carries no chord of its own, so there's nothing to the right to collide with.
 */
function overhangs(parts: ChordSegment[], index: number) {
	const next = parts[index + 1];
	return next !== undefined && !next.chord;
}

/**
 * Re-cuts a line so it can only wrap at a real word boundary.
 *
 * A segment is a run of lyrics under one chord, which lines up with neither end of a
 * word: ChordPro routinely puts a chord mid-word (`My shallow h[Em]eart's`) and then
 * runs several words to the next one. Since each segment is one flex item, the line
 * could only break at chord changes — printing "My shallow h / eart's the only" in a
 * narrow column, and refusing to break at all inside the long run after it.
 *
 * So: split every segment at its internal word boundaries (each piece keeps the space
 * that ended it), then glue back the pieces whose boundary isn't whitespace. Each group
 * is one flex item, so the browser breaks between words — and only between words.
 */
function wordGroups(line: ChordLine) {
	const parts: ChordSegment[] = [];
	for (const seg of line) {
		// Split *after* whitespace, so "eart's the only " → "eart's ", "the ", "only ".
		const chunks = seg.text.split(/(?<=\s)(?=\S)/);
		for (const [i, text] of chunks.entries()) {
			parts.push({ chord: i === 0 ? seg.chord : "", text });
		}
		if (chunks.length === 0) parts.push({ chord: seg.chord, text: "" });
	}

	const groups: { part: ChordSegment; index: number }[][] = [];
	parts.forEach((part, index) => {
		const previous = groups.at(-1)?.at(-1)?.part;
		if (!previous || /\s$/.test(previous.text)) groups.push([{ part, index }]);
		else groups.at(-1)?.push({ part, index });
	});
	return { parts, groups };
}

/** Section label — the small uppercase accent caption above a block. */
function SectionLabel({
	children,
	marginBottom,
	fontSize,
}: {
	children: React.ReactNode;
	marginBottom: number;
	fontSize: number;
}) {
	return (
		<div
			className="font-display font-semibold uppercase tracking-[0.12em] text-primary"
			style={{ fontSize, marginBottom }}
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
function TabSection({
	block,
	size,
	marginBottom,
	labelGap,
	labelSize,
}: {
	block: ChordBlock;
	size: number;
	marginBottom: number;
	labelGap: number;
	labelSize: number;
}) {
	return (
		<section
			className="max-w-full overflow-x-auto last:mb-0"
			style={{ marginBottom, breakInside: "avoid" }}
		>
			{block.label && (
				<SectionLabel marginBottom={labelGap} fontSize={labelSize}>
					{block.label}
				</SectionLabel>
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
