import { type SearchResult, searchSongs } from "@shared/songSearch";

/**
 * The current set, flattened for Live mode's in-drawer setlist panel.
 *
 * Live mode already holds the whole resolved setlist — from the server, or from the
 * downloaded snapshot when there is no signal (CLAUDE.md §D7) — so the panel is built
 * from that payload and never fetches. This module is the pure half: shaping the
 * entries and filtering them. Matching itself is the shared `searchSongs` (§D15), so a
 * lyric phrase written across an inline chord (`A[G]mazing grace`) and an accent-folded
 * query behave exactly as they do on the offline shelf.
 */

/** The bits of a setlist entry the panel reads, typed structurally so both the API
 *  payload and a localStorage snapshot of it satisfy it. */
export type LiveSetlistEntry = {
	chart?: {
		content?: string | null;
		key?: string | null;
		song?: {
			name?: string | null;
			credits?: ({ artist?: { name?: string | null } | null } | null)[] | null;
		} | null;
	} | null;
} | null;

export type LiveSong = {
	/** Position in the set — what Live mode jumps to. */
	index: number;
	title: string;
	artist: string;
	key: string;
	content: string;
};

/** One row of the panel: a song, plus the lyric line a lyric hit came from. */
export type LiveSongHit = {
	song: LiveSong;
	/** Present only for a lyric match — the words around the hit. */
	snippet?: string;
};

export function liveSetlistSongs(
	entries: readonly LiveSetlistEntry[],
): LiveSong[] {
	const songs: LiveSong[] = [];
	entries.forEach((entry, index) => {
		const chart = entry?.chart;
		// A row whose chart didn't resolve can't be performed or searched; skipping it
		// keeps `index` honest, because it is still the set position Live mode opens at.
		if (typeof chart?.content !== "string") return;
		songs.push({
			index,
			title: chart.song?.name ?? "Untitled",
			artist: (chart.song?.credits ?? [])
				.map((credit) => credit?.artist?.name ?? "")
				.filter(Boolean)
				.join(", "),
			key: chart.key ?? "",
			content: chart.content,
		});
	});
	return songs;
}

/**
 * The panel's rows for a query. An empty query is not "no matches" but "the whole set",
 * in set order — the panel doubles as the setlist itself, which is what a player wants
 * when they open it to see what's coming rather than to find something.
 */
export function filterLiveSetlist(
	query: string,
	songs: readonly LiveSong[],
): LiveSongHit[] {
	if (!query.trim()) return songs.map((song) => ({ song }));
	return searchSongs(query, songs as LiveSong[]).map(
		({ item, match }: SearchResult<LiveSong>) => ({
			song: item,
			snippet: match.field === "lyrics" ? match.snippet : undefined,
		}),
	);
}
