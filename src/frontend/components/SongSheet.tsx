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
	lyricSize,
	chordSize,
	className,
}: {
	content: string;
	capo?: number | null;
	view: ChordView;
	transpose?: number;
	lyricSize?: number;
	chordSize?: number;
	className?: string;
}) {
	const { blocks } = useMemo(
		() => buildSongView({ content, capo, transpose, view }),
		[content, capo, transpose, view],
	);
	return (
		<ChordSheet
			blocks={blocks}
			lyricSize={lyricSize}
			chordSize={chordSize}
			className={className}
		/>
	);
}
