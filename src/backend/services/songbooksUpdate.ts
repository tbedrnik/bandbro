import { prisma } from "@backend/prisma";
import { requireLineupWrite } from "./lineups";
import { assertChartsUsableIn, HttpError, requireWrite } from "./scope";

/**
 * Update a setlist's metadata, its lineup, and/or its full ordered song list. When
 * `chartIds` is provided it becomes the new contents in that exact order — this is how
 * add, remove and drag-to-reorder are all persisted from the client.
 */
export async function songbooksUpdate({
	id,
	userId,
	payload,
}: {
	id: string;
	userId: string;
	payload: {
		title?: string;
		description?: string;
		lineupId?: string;
		chartIds?: string[];
	};
}) {
	const songbook = await prisma.songbook.findUnique({
		where: { id },
		select: { id: true, organizationId: true },
	});
	if (!songbook) throw new HttpError(404, "Setlist not found.");
	await requireWrite(userId, songbook.organizationId);

	// Moving a set between lineups stays inside the band: across bands the charts would
	// have to be forked, which is what `songbooksClone` is for.
	if (payload.lineupId) {
		const { lineup } = await requireLineupWrite(userId, payload.lineupId);
		if (lineup.organizationId !== songbook.organizationId) {
			throw new HttpError(
				400,
				"That lineup belongs to another band — clone the setlist instead.",
			);
		}
	}

	await assertChartsUsableIn(payload.chartIds, songbook.organizationId);

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
			lineupId: payload.lineupId ?? undefined,
		},
		include: { songs: { orderBy: { order: "asc" } } },
	});
}
