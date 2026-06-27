import { prisma } from "@backend/prisma";
import { HttpError } from "./scope";

/**
 * A playlist with its songs in order. Each entry resolves the chart (the specific
 * arrangement) plus its song + credits, so Live mode / PDF can render without
 * further round-trips. Readable to any member of the owning org.
 */
export async function songbooksRead({
	id,
	userId,
}: {
	id: string;
	userId: string;
}) {
	const songbook = await prisma.songbook.findFirst({
		where: { id, organization: { members: { some: { userId } } } },
		include: {
			organization: { select: { id: true, name: true, slug: true } },
			songs: {
				orderBy: { order: "asc" },
				include: {
					chart: {
						include: {
							organization: { select: { id: true, name: true } },
							song: {
								include: { credits: { include: { artist: true } } },
							},
						},
					},
				},
			},
		},
	});
	if (!songbook) throw new HttpError(404, "Setlist not found.");
	return songbook;
}
