import { prisma } from "@backend/prisma";
import { HttpError, requireWrite } from "./scope";

export async function songsDelete({
	slug,
	userId,
}: {
	slug: string;
	userId: string;
}) {
	const song = await prisma.song.findUnique({
		where: { slug },
		select: { id: true, organizationId: true },
	});
	if (!song) throw new HttpError(404, "Song not found.");
	await requireWrite(userId, song.organizationId);
	await prisma.song.delete({ where: { id: song.id } });
	return { id: song.id, deleted: true };
}
