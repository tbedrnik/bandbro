import { prisma } from "@backend/prisma";
import { SONGS_PAGE, SONGS_PAGE_MAX } from "@shared/pagination";
import type { ProficiencyLevel, Readiness } from "@shared/proficiency";
import type { User } from "better-auth/types";
import type { Prisma } from "../../generated/prisma/client";
import { lineupReadinessFor, myLevels } from "./proficiency";
import { readableScopeWhere } from "./scope";

export type SongsListQuery = {
	/** Restrict to a single scope: an organization id, or "curated" for the null scope. */
	scope?: string;
	/** Free-text match on song or artist name. */
	q?: string;
	/** Filter by artist slug. */
	artist?: string;
	/** Filter by chart key (e.g. "Am"). */
	key?: string;
	/** Filter by tag slug. */
	tag?: string;
	/**
	 * Annotate each song with how ready this lineup is for it (CLAUDE.md §D26) — what
	 * the setlist builder sorts on. Without it `readiness` comes back null.
	 */
	lineupId?: string;
	/**
	 * Page size. Defaults to `SONGS_PAGE` and is clamped to `SONGS_PAGE_MAX` rather than
	 * rejected — a caller asking for too much should get a sane page, not a 422.
	 */
	limit?: number;
};

export async function songsList({
	user,
	query = {},
}: {
	user?: User;
	query?: SongsListQuery;
}) {
	// A scope filter narrows what the caller may already read — it never widens it.
	// `{organizationId: query.scope}` used to be the whole filter, so passing the id of
	// a band you don't belong to enumerated its library.
	const scopeFilter: Prisma.SongWhereInput =
		query.scope === "curated"
			? { organizationId: null }
			: query.scope
				? {
						AND: [
							{ organizationId: query.scope },
							readableScopeWhere(user?.id),
						],
					}
				: readableScopeWhere(user?.id);

	const and: Prisma.SongWhereInput[] = [scopeFilter];
	if (query.q) {
		and.push({
			OR: [
				{ name: { contains: query.q } },
				{ credits: { some: { artist: { name: { contains: query.q } } } } },
			],
		});
	}
	if (query.artist) {
		and.push({ credits: { some: { artist: { slug: query.artist } } } });
	}
	if (query.tag) {
		and.push({ tags: { some: { tag: { slug: query.tag } } } });
	}
	if (query.key) {
		and.push({ charts: { some: { key: query.key } } });
	}

	const songs = await prisma.song.findMany({
		where: { AND: and },
		orderBy: { name: "asc" },
		// This query used to be unbounded, and the Library fired it on every keystroke:
		// a full-library scan per character, with every row serialized back (§D27).
		take: Math.min(
			Math.max(1, Math.trunc(query.limit ?? SONGS_PAGE)),
			SONGS_PAGE_MAX,
		),
		include: {
			organization: {
				select: { id: true, name: true, slug: true, metadata: true },
			},
			credits: { include: { artist: true } },
			tags: { include: { tag: true } },
			charts: {
				where: readableScopeWhere(user?.id),
				select: { id: true, key: true, capo: true, tempo: true },
				take: 1,
			},
		},
	});

	// Proficiency rides along on the list rather than sitting behind its own endpoint:
	// every screen that shows songs wants "can I play this?" next to them, and a second
	// round-trip per screen buys nothing. Both fields are always present so the
	// Eden-derived client type stays one shape (CLAUDE.md §D9).
	const songIds = songs.map((s) => s.id);
	const mine = user?.id ? await myLevels(user.id, songIds) : new Map();
	const readiness = query.lineupId
		? await lineupReadinessFor(query.lineupId, songIds)
		: new Map<string, Readiness>();

	return songs.map((song) => ({
		...song,
		myLevel: (mine.get(song.id) ?? "UNKNOWN") as ProficiencyLevel,
		readiness: readiness.get(song.id) ?? null,
	}));
}
