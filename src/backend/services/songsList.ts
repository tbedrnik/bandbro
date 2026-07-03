import { prisma } from "@backend/prisma";
import type { User } from "better-auth/types";
import type { Prisma } from "../../generated/prisma/client";
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
};

export async function songsList({
	user,
	query = {},
}: {
	user?: User;
	query?: SongsListQuery;
}) {
	const scopeFilter: Prisma.SongWhereInput =
		query.scope === "curated"
			? { organizationId: null }
			: query.scope
				? { organizationId: query.scope }
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

	return prisma.song.findMany({
		where: { AND: and },
		orderBy: { name: "asc" },
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
}
