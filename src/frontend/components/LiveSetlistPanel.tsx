import { MetaChip } from "@frontend/components/MetaChip";
import { Input } from "@frontend/components/ui/input";
import {
	filterLiveSetlist,
	type LiveSetlistEntry,
	type LiveSong,
	liveSetlistSongs,
} from "@frontend/lib/liveSetlist";
import { displayKey } from "@shared/notation";
import { IconPlayerPlay, IconSearch } from "@tabler/icons-react";
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
}: {
	/** The setlist's songs, straight off the payload Live mode is rendering. */
	entries: readonly LiveSetlistEntry[];
	currentIndex: number;
	onSelect: (index: number) => void;
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
							onSelect={onSelect}
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
	onSelect,
}: {
	song: LiveSong;
	snippet?: string;
	current: boolean;
	onSelect: (index: number) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onSelect(song.index)}
			aria-current={current ? "true" : undefined}
			className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-0 ${
				current ? "bg-secondary" : "hover:bg-secondary/60"
			}`}
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
					className={`block truncate font-display text-[15px] font-medium ${
						current ? "text-primary" : ""
					}`}
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
	);
}
