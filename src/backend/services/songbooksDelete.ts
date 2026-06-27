import { prisma } from "@backend/prisma";
import { HttpError, requireWrite } from "./scope";

export async function songbooksDelete({
	id,
	userId,
}: {
	id: string;
	userId: string;
}) {
	const songbook = await prisma.songbook.findUnique({
		where: { id },
		select: { id: true, organizationId: true },
	});
	if (!songbook) throw new HttpError(404, "Setlist not found.");
	await requireWrite(userId, songbook.organizationId);
	await prisma.songbook.delete({ where: { id } });
	return { id, deleted: true };
}
