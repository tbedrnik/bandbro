import { prisma } from "@backend/prisma";
import { requireLineupWrite } from "./lineups";
import { assertChartsUsableIn } from "./scope";

/**
 * Create a setlist on a lineup (CLAUDE.md §D25). The band is derived from the lineup and
 * never taken from the caller, which is what stops `Songbook.organizationId` — the column
 * every role guard reads — from drifting away from `lineup.organizationId`.
 */
export async function songbooksCreate({
	userId,
	payload,
}: {
	userId: string;
	payload: {
		title: string;
		description?: string;
		lineupId: string;
		chartIds?: string[];
	};
}) {
	const { lineup } = await requireLineupWrite(userId, payload.lineupId);
	await assertChartsUsableIn(payload.chartIds, lineup.organizationId);

	return prisma.songbook.create({
		data: {
			title: payload.title,
			description: payload.description,
			lineupId: lineup.id,
			organizationId: lineup.organizationId,
			songs: {
				create: (payload.chartIds ?? []).map((chartId, order) => ({
					chartId,
					order,
				})),
			},
		},
		include: { songs: true },
	});
}
