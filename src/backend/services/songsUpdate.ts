import { prisma } from "@backend/prisma";
import { CreditRole } from "../../generated/prisma/enums";
import { parseChordproMeta } from "../../shared/chordpro";
import {
	findOrCreateArtist,
	findOrCreateTags,
	HttpError,
	requireWrite,
} from "./scope";

export type SongUpdatePayload = {
	name?: string;
	year?: number | null;
	tags?: string[];
	credits?: { artist: { name: string }; role: CreditRole }[];
	chart?: { id?: string; content: string; description?: string };
};

export async function songsUpdate({
	slug,
	userId,
	payload,
}: {
	slug: string;
	userId: string;
	payload: SongUpdatePayload;
}) {
	const song = await prisma.song.findUnique({
		where: { slug },
		include: { charts: { orderBy: { createdAt: "asc" }, take: 1 } },
	});
	if (!song) throw new HttpError(404, "Song not found.");
	await requireWrite(userId, song.organizationId);

	if (payload.chart) {
		const meta = parseChordproMeta(payload.chart.content);
		const chartId = payload.chart.id ?? song.charts[0]?.id;
		if (chartId) {
			await prisma.chart.update({
				where: { id: chartId },
				data: {
					content: payload.chart.content,
					description: payload.chart.description,
					key: meta.key,
					capo: meta.capo,
					tempo: meta.tempo,
					timeSignature: meta.timeSignature,
				},
			});
		}
	}

	if (payload.tags) {
		const tagIds = await findOrCreateTags(payload.tags);
		await prisma.songTag.deleteMany({ where: { songId: song.id } });
		await prisma.songTag.createMany({
			data: tagIds.map((tagId) => ({ songId: song.id, tagId })),
		});
	}

	if (payload.credits) {
		await prisma.credit.deleteMany({ where: { songId: song.id } });
		for (const c of payload.credits) {
			await prisma.credit.create({
				data: {
					songId: song.id,
					artistId: await findOrCreateArtist(c.artist.name),
					role: c.role ?? CreditRole.ARTIST,
				},
			});
		}
	}

	return prisma.song.update({
		where: { id: song.id },
		data: {
			name: payload.name ?? undefined,
			year: payload.year === undefined ? undefined : payload.year,
		},
		include: { charts: true, tags: { include: { tag: true } } },
	});
}
