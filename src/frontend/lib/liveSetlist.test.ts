import { describe, expect, test } from "bun:test";
import {
	filterLiveSetlist,
	type LiveSetlistEntry,
	liveSetlistSongs,
} from "./liveSetlist";

const entry = (
	name: string,
	content: string,
	artist?: string,
	key?: string,
): LiveSetlistEntry => ({
	chart: {
		content,
		key: key ?? null,
		song: {
			name,
			credits: artist ? [{ artist: { name: artist } }] : [],
		},
	},
});

const SET: LiveSetlistEntry[] = [
	entry(
		"Amazing Grace",
		"{title: Amazing Grace}\nA[G]mazing grace how [G7]sweet",
		"Traditional",
		"G",
	),
	entry("Šeň", "{title: Šeň}\nZpívám o [Am]lásce", "Kabát"),
	entry(
		"Wayfaring Stranger",
		"I am a poor wayfaring stranger",
		"Traditional",
		"Em",
	),
];

describe("liveSetlistSongs", () => {
	test("flattens entries, keeping set position", () => {
		const songs = liveSetlistSongs(SET);
		expect(songs.map((s) => [s.index, s.title, s.artist, s.key])).toEqual([
			[0, "Amazing Grace", "Traditional", "G"],
			[1, "Šeň", "Kabát", ""],
			[2, "Wayfaring Stranger", "Traditional", "Em"],
		]);
	});

	test("skips an unresolved chart but keeps the others' positions", () => {
		const songs = liveSetlistSongs([null, ...SET.slice(0, 1)]);
		expect(songs).toHaveLength(1);
		expect(songs[0].index).toBe(1);
	});
});

describe("filterLiveSetlist", () => {
	const songs = liveSetlistSongs(SET);

	test("an empty query is the whole set, in order, with no snippets", () => {
		const hits = filterLiveSetlist("   ", songs);
		expect(hits.map((h) => h.song.index)).toEqual([0, 1, 2]);
		expect(hits.every((h) => h.snippet === undefined)).toBe(true);
	});

	test("matches a lyric phrase written across an inline chord", () => {
		const hits = filterLiveSetlist("wayfaring stranger", songs);
		// Title match wins over the lyric line that says the same thing.
		expect(hits.map((h) => h.song.title)).toEqual(["Wayfaring Stranger"]);
		expect(hits[0].snippet).toBeUndefined();

		const lyric = filterLiveSetlist("grace how sweet", songs);
		expect(lyric.map((h) => h.song.title)).toEqual(["Amazing Grace"]);
		expect(lyric[0].snippet).toContain("Amazing grace how sweet");
	});

	test("folds accents, so a plain-keyboard query still finds the song", () => {
		expect(filterLiveSetlist("sen", songs).map((h) => h.song.title)).toEqual([
			"Šeň",
		]);
	});

	test("no match is an empty list, not the whole set", () => {
		expect(filterLiveSetlist("nothing here", songs)).toEqual([]);
	});
});
