import { prisma } from "@backend/prisma";
import type { CreditRole } from "../../generated/prisma/enums";
import { HttpError, uniqueSongSlug } from "./scope";

/**
 * The song/chart copy behind every fork (CLAUDE.md §D3), shared by `songsFork` (fork a
 * song you can read into a band you can write) and `songbooksClone` (cloning a setlist
 * across bands has to copy the charts, or the two bands' setlists would keep editing
 * each other's).
 *
 * Artists and tags are *referenced*, not copied — they are global rows, and duplicating
 * them would fragment the Library's filters.
 */
export type ForkableSong = {
	id: string;
	name: string;
	year: number | null;
	credits: { artistId: string; role: CreditRole }[];
	tags: { tagId: string }[];
};

export type ForkableChart = {
	id: string;
	content: string;
	description: string | null;
	key: string | null;
	capo: number | null;
	tempo: number | null;
	timeSignature: string | null;
};

export function copySongWithChart({
	song,
	chart,
	targetOrganizationId,
	slug,
}: {
	song: ForkableSong;
	chart: ForkableChart;
	targetOrganizationId: string;
	slug: string;
}) {
	return prisma.song.create({
		data: {
			name: song.name,
			slug,
			year: song.year,
			organizationId: targetOrganizationId,
			forkedFromId: song.id,
			credits: {
				create: song.credits.map((c) => ({
					artistId: c.artistId,
					role: c.role,
				})),
			},
			tags: { create: song.tags.map((t) => ({ tagId: t.tagId })) },
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

/** Fork the song behind one chart into a band. Returns the new chart's id. */
export async function forkChartInto(
	chartId: string,
	targetOrganizationId: string,
): Promise<string> {
	const chart = await prisma.chart.findUnique({
		where: { id: chartId },
		include: { song: { include: { credits: true, tags: true } } },
	});
	if (!chart) throw new HttpError(404, "Song not found.");

	const created = await copySongWithChart({
		song: chart.song,
		chart,
		targetOrganizationId,
		slug: await uniqueSongSlug(chart.song.name),
	});
	const forked = created.charts[0];
	if (!forked) throw new HttpError(500, "Fork produced no chart.");
	return forked.id;
}
