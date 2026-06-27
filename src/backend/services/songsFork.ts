import { prisma } from "@backend/prisma";
import {
	HttpError,
	readableScopeWhere,
	requireWrite,
	uniqueSongSlug,
} from "./scope";

/**
 * Fork a readable song (+ a chosen chart) into a writable scope. The copy is fully
 * independent of the source; provenance is kept via forkedFromId on both the Song
 * and the Chart. See CLAUDE.md §D3. PRD §6: read anything → write anywhere you can.
 */
export async function songsFork({
	slug,
	userId,
	targetOrganizationId,
	chartId,
}: {
	slug: string;
	userId: string;
	targetOrganizationId: string;
	chartId?: string;
}) {
	await requireWrite(userId, targetOrganizationId);

	const source = await prisma.song.findFirst({
		where: { slug, ...readableScopeWhere(userId) },
		include: {
			credits: true,
			tags: true,
			charts: {
				where: readableScopeWhere(userId),
				orderBy: { createdAt: "asc" },
			},
		},
	});
	if (!source) throw new HttpError(404, "Song not found.");

	const chart = source.charts.find((c) => c.id === chartId) ?? source.charts[0];
	if (!chart) throw new HttpError(400, "This song has no chart to fork.");

	const newSlug = await uniqueSongSlug(source.name);

	return prisma.song.create({
		data: {
			name: source.name,
			slug: newSlug,
			year: source.year,
			organizationId: targetOrganizationId,
			forkedFromId: source.id,
			credits: {
				create: source.credits.map((c) => ({
					artistId: c.artistId,
					role: c.role,
				})),
			},
			tags: { create: source.tags.map((t) => ({ tagId: t.tagId })) },
			charts: {
				create: {
					organizationId: targetOrganizationId,
					forkedFromId: chart.id,
					content: chart.content,
					description: chart.description,
					key: chart.key,
					capo: chart.capo,
					tempo: chart.tempo,
					timeSignature: chart.timeSignature,
				},
			},
		},
		include: { charts: true },
	});
}
