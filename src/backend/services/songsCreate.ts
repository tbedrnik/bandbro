import { prisma } from "@backend/prisma";
import { CreditRole } from "../../generated/prisma/enums";
import { parseChordproMeta } from "../../shared/chordpro";
import {
	findOrCreateArtist,
	findOrCreateTags,
	requireWrite,
	uniqueSongSlug,
} from "./scope";

export type SongCreatePayload = {
	name: string;
	year?: number | null;
	/** Target scope: an organization id (band or personal). Curated is read-only. */
	organizationId: string;
	credits?: { artist: { name: string }; role: CreditRole }[];
	tags?: string[];
	chart: { content: string; description?: string };
};

export async function songsCreate({
	userId,
	payload,
}: {
	userId: string;
	payload: SongCreatePayload;
}) {
	await requireWrite(userId, payload.organizationId);

	const meta = parseChordproMeta(payload.chart.content);
	const slug = await uniqueSongSlug(payload.name);
	const tagIds = await findOrCreateTags(payload.tags ?? meta.tags);

	const credits = payload.credits?.length
		? payload.credits
		: meta.artist
			? [{ artist: { name: meta.artist }, role: CreditRole.ARTIST }]
			: [];

	const creditData = [];
	for (const c of credits) {
		creditData.push({
			artistId: await findOrCreateArtist(c.artist.name),
			role: c.role,
		});
	}

	return prisma.song.create({
		data: {
			name: payload.name,
			slug,
			year: payload.year ?? meta.year ?? null,
			organizationId: payload.organizationId,
			charts: {
				create: {
					organizationId: payload.organizationId,
					content: payload.chart.content,
					description: payload.chart.description,
					key: meta.key,
					capo: meta.capo,
					tempo: meta.tempo,
					timeSignature: meta.timeSignature,
				},
			},
			credits: { create: creditData },
			tags: { create: tagIds.map((tagId) => ({ tagId })) },
		},
		include: { charts: true },
	});
}
