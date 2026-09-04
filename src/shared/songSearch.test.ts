import { describe, expect, test } from "bun:test";
import {
	matchSong,
	normalizeForSearch,
	plainLyrics,
	searchSongs,
} from "./songSearch";

const AMAZING = `{title: Amazing Grace}
{artist: J. Newton}
{key: G}
{start_of_verse: Verse 1}
A[G]mazing [G7]grace how [C]sweet the [G]sound
That [G]saved a wretch like [D]me
{end_of_verse}`;

const CZECH = `{title: Sen}
{artist: Kryštof}
[Am]Zdálo se mi o [F]tobě, měsíc svítil na [C]zeď`;

describe("normalizeForSearch", () => {
	test("folds accents, case and whitespace", () => {
		expect(normalizeForSearch("  Šeň   Kryštof ")).toBe("sen krystof");
	});

	test("an empty or whitespace-only query folds to nothing", () => {
		expect(normalizeForSearch("   ")).toBe("");
	});
});

describe("plainLyrics", () => {
	test("glues words back together across an inline chord", () => {
		// The whole point: `A[G]mazing` is two parsed segments, and a raw substring
		// search over the source would never find "amazing grace".
		expect(plainLyrics(AMAZING)).toContain("Amazing grace how sweet the sound");
	});

	test("drops directives and section labels", () => {
		const lyrics = plainLyrics(AMAZING);
		expect(lyrics).not.toContain("title");
		expect(lyrics).not.toContain("Verse 1");
		expect(lyrics).not.toContain("[G]");
	});
});

describe("matchSong", () => {
	const song = {
		title: "Amazing Grace",
		artist: "J. Newton",
		content: AMAZING,
	};

	test("a title prefix outranks a title hit in the middle", () => {
		const prefix = matchSong("amaz", song);
		const middle = matchSong("grace", song);
		expect(prefix?.field).toBe("title");
		expect(middle?.field).toBe("title");
		expect(prefix?.score).toBeGreaterThan(middle?.score ?? 0);
	});

	test("falls through to the artist", () => {
		expect(matchSong("newton", song)).toMatchObject({ field: "artist" });
	});

	test("finds a phrase that spans an inline chord", () => {
		const hit = matchSong("saved a wretch", song);
		expect(hit?.field).toBe("lyrics");
		expect(hit?.snippet).toContain("saved a wretch");
	});

	test("lyric snippets keep their diacritics even though the search ignores them", () => {
		const hit = matchSong("mesic svitil", {
			title: "Sen",
			artist: "Kryštof",
			content: CZECH,
		});
		expect(hit?.field).toBe("lyrics");
		// Cut from the original text via the fold map, not from the folded copy.
		expect(hit?.snippet).toContain("měsíc svítil");
	});

	test("an unaccented query still matches an accented artist", () => {
		expect(
			matchSong("krystof", { title: "Sen", artist: "Kryštof", content: CZECH }),
		).toMatchObject({ field: "artist" });
	});

	test("no match, and an empty query, both return null", () => {
		expect(matchSong("banjo", song)).toBeNull();
		expect(matchSong("  ", song)).toBeNull();
	});
});

describe("searchSongs", () => {
	const songs = [
		{
			title: "Wayfaring Stranger",
			artist: "Traditional",
			content: "I am a poor [Em]wayfaring stranger",
		},
		{ title: "Amazing Grace", artist: "J. Newton", content: AMAZING },
	];

	test("ranks a title match above a lyric match", () => {
		const hits = searchSongs("wayfaring", songs);
		expect(hits).toHaveLength(1);
		expect(hits[0].item.title).toBe("Wayfaring Stranger");
	});

	test("returns every match, best first", () => {
		const hits = searchSongs("a", songs);
		expect(hits.length).toBe(2);
		expect(hits[0].match.score).toBeGreaterThanOrEqual(hits[1].match.score);
	});

	test("an empty query matches nothing rather than everything", () => {
		expect(searchSongs("", songs)).toEqual([]);
	});
});
