import { prisma } from "@backend/prisma";
import type { Prisma } from "../../generated/prisma/client";

export async function songbooksList({
	userId,
	query = {},
}: {
	userId: string;
	query?: { scope?: string; lineupId?: string };
}) {
	// Membership is the floor, never something a query param can step around: `scope`
	// used to be applied as the whole filter, so passing a band id you don't belong to
	// listed its setlists.
	const where: Prisma.SongbookWhereInput = {
		organization: { members: { some: { userId } } },
		...(query.scope ? { organizationId: query.scope } : {}),
		...(query.lineupId ? { lineupId: query.lineupId } : {}),
	};

	return prisma.songbook.findMany({
		where,
		orderBy: { updatedAt: "desc" },
		include: {
			organization: {
				select: { id: true, name: true, slug: true, metadata: true },
			},
			lineup: { select: { id: true, name: true, isDefault: true } },
			_count: { select: { songs: true } },
		},
	});
}
