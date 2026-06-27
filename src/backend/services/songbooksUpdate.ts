import { prisma } from "@backend/prisma";
import { HttpError, requireWrite } from "./scope";

/**
 * Update a playlist's metadata and/or its full ordered song list. When `chartIds`
 * is provided it becomes the new contents in that exact order — this is how add,
 * remove and drag-to-reorder are all persisted from the client.
 */
export async function songbooksUpdate({
	id,
	userId,
	payload,
}: {
	id: string;
	userId: string;
	payload: { title?: string; description?: string; chartIds?: string[] };
}) {
	const songbook = await prisma.songbook.findUnique({
		where: { id },
		select: { id: true, organizationId: true },
	});
	if (!songbook) throw new HttpError(404, "Setlist not found.");
	await requireWrite(userId, songbook.organizationId);

	if (payload.chartIds) {
		await prisma.songbookSong.deleteMany({ where: { songbookId: id } });
		await prisma.songbookSong.createMany({
			data: payload.chartIds.map((chartId, order) => ({
				songbookId: id,
				chartId,
				order,
			})),
		});
	}

	return prisma.songbook.update({
		where: { id },
		data: {
			title: payload.title ?? undefined,
			description:
				payload.description === undefined ? undefined : payload.description,
		},
		include: { songs: { orderBy: { order: "asc" } } },
	});
}
