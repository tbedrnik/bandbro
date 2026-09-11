import { ChordSheet } from "@frontend/components/ChordSheet";
import { buildSongView } from "@shared/songView";
import type { ChordView } from "@shared/transpose";
import { useMemo } from "react";

/**
 * Renders a ChordPro chart as a chord sheet in the chosen view, applying the capo
 * translation and any manual transpose via the shared engine. The single rendering
 * surface reused by the Song View, the editor preview and Live mode.
 */
export function SongSheet({
	content,
	capo,
	view,
	transpose = 0,
	collapseChoruses,
	lyricSize,
	chordSize,
	hideChords,
	hideSectionLabels,
	gap,
	columns,
	align,
	className,
}: {
	content: string;
	capo?: number | null;
	view: ChordView;
	transpose?: number;
	/** Collapse repeated, identical choruses to a one-line recall (CLAUDE.md §D23). */
	collapseChoruses?: boolean;
	lyricSize?: number;
	chordSize?: number;
	hideChords?: boolean;
	/** Drop the "VERSE 1"/"CHORUS" captions — Live mode, where the screen is the budget. */
	hideSectionLabels?: boolean;
	gap?: number;
	columns?: number;
	align?: "left" | "center";
	className?: string;
}) {
	const { blocks } = useMemo(
		() => buildSongView({ content, capo, transpose, view, collapseChoruses }),
		[content, capo, transpose, view, collapseChoruses],
	);
	return (
		<ChordSheet
			blocks={blocks}
			lyricSize={lyricSize}
			chordSize={chordSize}
			hideChords={hideChords}
			hideSectionLabels={hideSectionLabels}
			gap={gap}
			columns={columns}
			align={align}
			className={className}
		/>
	);
}
