/**
 * Local song search — titles, artists and lyrics, over content already on the device.
 *
 * Written for the offline shelf and Live mode, so it deliberately owns no I/O: callers
 * hand it songs they already hold (a downloaded setlist snapshot, §D7) and get matches
 * back. That keeps it a pure function the tests can pin down, and keeps searching usable
 * with no signal — the one moment on stage when you actually need to find a song and
 * can't ask the server.
 *
 * Two things it has to get right to be useful on real charts:
 *
 * - **Chords sit inside words.** ChordPro writes `A[G]mazing grace how [G7]sweet`, so a
 *   raw substring search for "amazing grace" finds nothing. Lyrics are recovered by
 *   running the shared parser and gluing each line's segment text back together, which
 *   drops chords and directives for free.
 * - **Diacritics.** The library is largely Czech; someone typing "sen" on a phone
 *   keyboard should still find "Šeň". Both query and haystack are folded to unaccented,
 *   lowercase, single-spaced text before comparing.
 */

import { parseChordpro } from "./chordpro";

export type SearchableSong = {
	title: string;
	artist?: string;
	/** Raw ChordPro source. */
	content: string;
};

export type MatchField = "title" | "artist" | "lyrics";

export type SongMatch = {
	field: MatchField;
	/** Where the hit reads from, with a little context — the lyric line for a lyric hit. */
	snippet: string;
	/** Higher is a better match; callers sort descending. */
	score: number;
};

/**
 * A folded haystack plus, for every folded character, the index it came from in the
 * source. Folding is not length-preserving (a decomposed accent drops a character,
 * a run of spaces collapses), so a lyric snippet cut straight at the folded offset
 * would drift; the map is what lets the snippet be cut from the *original* text and
 * keep its diacritics.
 */
type Folded = { text: string; map: number[] };

function fold(value: string): Folded {
	let text = "";
	const map: number[] = [];
	for (let i = 0; i < value.length; i++) {
		const char = value[i];
		if (/\s/.test(char)) {
			// Collapse runs of whitespace, and never open with one.
			if (text.length === 0 || text.endsWith(" ")) continue;
			text += " ";
			map.push(i);
			continue;
		}
		const folded = char
			.normalize("NFD")
			.replace(/\p{Diacritic}/gu, "")
			.toLowerCase();
		for (const out of folded) {
			text += out;
			map.push(i);
		}
	}
	// A trailing space would make "grace " fail to match at the end of a chart.
	if (text.endsWith(" ")) {
		text = text.slice(0, -1);
		map.pop();
	}
	return { text, map };
}

/** Fold to a comparable form: unaccented, lowercase, single-spaced. */
export function normalizeForSearch(value: string): string {
	return fold(value).text;
}

/**
 * The singable text of a chart: chords, directives and section labels removed, one
 * space between lines. Goes through the shared parser rather than a bespoke regex so
 * search sees exactly what the chord sheet renders.
 */
export function plainLyrics(content: string): string {
	const { blocks } = parseChordpro(content);
	const lines: string[] = [];
	for (const block of blocks) {
		for (const line of block.lines) {
			const text = line
				.map((segment) => segment.text)
				.join("")
				.trim();
			if (text) lines.push(text);
		}
	}
	return lines.join(" ");
}

/** Trim a lyric hit down to the words around it, so a result row stays one line. */
function snippetAround(text: string, start: number, end: number): string {
	const PAD = 32;
	const from = Math.max(0, start - PAD);
	const to = Math.min(text.length, end + PAD);
	const body = text.slice(from, to).replace(/\s+/g, " ").trim();
	return `${from > 0 ? "…" : ""}${body}${to < text.length ? "…" : ""}`;
}

/**
 * Best match for `query` in one song, or null. Fields are ranked title → artist →
 * lyrics, and a hit at the start of a field beats one in the middle, so typing "amaz"
 * puts "Amazing Grace" above a song that merely sings the word.
 */
export function matchSong(
	query: string,
	song: SearchableSong,
): SongMatch | null {
	const needle = normalizeForSearch(query);
	if (!needle) return null;

	const titleAt = normalizeForSearch(song.title).indexOf(needle);
	if (titleAt === 0) return { field: "title", snippet: song.title, score: 100 };
	if (titleAt > 0) return { field: "title", snippet: song.title, score: 80 };

	// `needle` is non-empty, so an absent artist can't match — no guard needed.
	const artist = normalizeForSearch(song.artist ?? "");
	if (artist.includes(needle)) {
		return { field: "artist", snippet: song.artist ?? "", score: 60 };
	}

	const lyrics = plainLyrics(song.content);
	const folded = fold(lyrics);
	const at = folded.text.indexOf(needle);
	if (at < 0) return null;
	return {
		field: "lyrics",
		snippet: snippetAround(
			lyrics,
			folded.map[at],
			folded.map[at + needle.length - 1] + 1,
		),
		score: 40,
	};
}

export type SearchResult<T> = { item: T; match: SongMatch };

/** Match every song, best first. Ties keep their original (setlist) order. */
export function searchSongs<T extends SearchableSong>(
	query: string,
	songs: T[],
): SearchResult<T>[] {
	return songs
		.map((item) => ({ item, match: matchSong(query, item) }))
		.filter((hit): hit is SearchResult<T> => hit.match !== null)
		.sort((a, b) => b.match.score - a.match.score);
}
