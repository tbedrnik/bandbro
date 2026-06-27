import { prisma } from "@backend/prisma";

export async function songbooksList({
	userId,
	query = {},
}: {
	userId: string;
	query?: { scope?: string };
}) {
	return prisma.songbook.findMany({
		where: query.scope
			? { organizationId: query.scope }
			: { organization: { members: { some: { userId } } } },
		orderBy: { updatedAt: "desc" },
		include: {
			organization: {
				select: { id: true, name: true, slug: true, metadata: true },
			},
			_count: { select: { songs: true } },
		},
	});
}
