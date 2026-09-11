import { MetaChip } from "@frontend/components/MetaChip";
import { Input } from "@frontend/components/ui/input";
import {
	filterLiveSetlist,
	type LiveSetlistEntry,
	type LiveSong,
	liveSetlistSongs,
} from "@frontend/lib/liveSetlist";
import { cn } from "@frontend/lib/utils";
import { displayKey } from "@shared/notation";
import {
	IconPlayerPlay,
	IconSearch,
	IconSquare,
	IconSquareCheckFilled,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

/**
 * Tonight's set, inside Live mode — the song list in order, the current one marked, and
 * a search box over titles, artists and lyrics.
 *
 * It is a panel rather than a route on purpose: navigating away from `/live/$id` would
 * drop transpose, scroll position and the auto-scroll loop, and would need the network
 * to come back. Everything here reads the setlist Live mode already holds, so it works
 * from a downloaded snapshot with no signal (CLAUDE.md §D7/§D15).
 */
export function LiveSetlistPanel({
	entries,
	currentIndex,
	onSelect,
	isPlayed,
	onTogglePlayed,
}: {
	/** The setlist's songs, straight off the payload Live mode is rendering. */
	entries: readonly LiveSetlistEntry[];
	currentIndex: number;
	onSelect: (index: number) => void;
	/** Whether the song at this set position has already been played tonight. */
	isPlayed: (index: number) => boolean;
	onTogglePlayed: (index: number) => void;
}) {
	const [query, setQuery] = useState("");
	const songs = useMemo(() => liveSetlistSongs(entries), [entries]);
	const hits = useMemo(() => filterLiveSetlist(query, songs), [query, songs]);

	return (
		<div className="flex min-h-0 flex-col">
			<div className="relative px-4 pb-2">
				<IconSearch className="pointer-events-none absolute left-7 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search this set — title, artist or lyrics"
					aria-label="Search this setlist"
					// vaul reads a drag gesture off the drawer body; without this a swipe
					// that starts on the input dismisses the drawer instead of selecting text.
					data-vaul-no-drag
					className="h-10 pl-9"
				/>
			</div>

			{hits.length === 0 ? (
				<div className="px-4 py-10 text-center text-sm text-muted-foreground">
					Nothing in this set matches “{query}”.
				</div>
			) : (
				<div
					data-vaul-no-drag
					className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
				>
					{hits.map(({ song, snippet }) => (
						<SongRow
							key={song.index}
							song={song}
							snippet={snippet}
							current={song.index === currentIndex}
							played={isPlayed(song.index)}
							onSelect={onSelect}
							onTogglePlayed={onTogglePlayed}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function SongRow({
	song,
	snippet,
	current,
	played,
	onSelect,
	onTogglePlayed,
}: {
	song: LiveSong;
	snippet?: string;
	current: boolean;
	played: boolean;
	onSelect: (index: number) => void;
	onTogglePlayed: (index: number) => void;
}) {
	// The song on screen right now is marked played after a minute (§D24) while it is still
	// the song on screen — so it keeps its full weight, and only the checkbox says so.
	// Dimming the row you are reading off a stand would be the one place this hurts.
	const spent = played && !current;
	return (
		<div
			className={cn(
				"flex items-center border-b border-border pr-1 last:border-0",
				current ? "bg-secondary" : "hover:bg-secondary/60",
			)}
		>
			<button
				type="button"
				onClick={() => onSelect(song.index)}
				aria-current={current ? "true" : undefined}
				className={cn(
					"flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left",
					spent && "opacity-50",
				)}
			>
				<span className="grid size-6 flex-none place-items-center font-mono text-xs text-muted-foreground">
					{current ? (
						<IconPlayerPlay className="size-4 text-primary" />
					) : (
						song.index + 1
					)}
				</span>
				<span className="min-w-0 flex-1">
					<span
						className={cn(
							"block truncate font-display text-[15px] font-medium",
							current && "text-primary",
							spent && "line-through",
						)}
					>
						{song.title}
					</span>
					<span className="block truncate text-xs text-muted-foreground">
						{snippet ? (
							<span className="font-sans italic">“{snippet}”</span>
						) : (
							song.artist || "—"
						)}
					</span>
				</span>
				{song.key && (
					<MetaChip
						label=""
						value={displayKey(song.key)}
						className="flex-none px-2 py-1"
					/>
				)}
			</button>
			<PlayedCheckbox
				checked={played}
				label={song.title}
				onToggle={() => onTogglePlayed(song.index)}
				className="size-10"
			/>
		</div>
	);
}

/**
 * The played mark. A checkbox and nothing else — no "Played" caption: the list is read at
 * a glance between songs, and a column of repeated words is what you'd have to read past.
 * Exported because the peek bar carries the same control for the current song.
 */
export function PlayedCheckbox({
	checked,
	label,
	onToggle,
	className,
}: {
	checked: boolean;
	/** Song title, for the accessible name — the control itself is wordless. */
	label: string;
	onToggle: () => void;
	className?: string;
}) {
	return (
		<button
			type="button"
			role="checkbox"
			aria-checked={checked}
			aria-label={`${label} — played`}
			onClick={onToggle}
			className={cn(
				"grid flex-none place-items-center rounded-lg transition-colors hover:bg-muted",
				checked ? "text-primary" : "text-muted-foreground",
				className,
			)}
		>
			{checked ? (
				<IconSquareCheckFilled className="size-5" />
			) : (
				<IconSquare className="size-5" />
			)}
		</button>
	);
}
