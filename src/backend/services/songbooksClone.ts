import { prisma } from "@backend/prisma";
import { forkChartInto } from "./forkChart";
import { requireLineupWrite } from "./lineups";
import { foreignChartIds, HttpError, requireMember } from "./scope";

/**
 * Copy a setlist onto another lineup (CLAUDE.md §D25). The point of the whole lineup
 * model: the same three friends perform as "Duo Tomi Kohy" and as "Banda", and the set
 * for one night is mostly the set for another.
 *
 * Within one band this copies *rows only* — both setlists point at the same charts, so
 * fixing a typo fixes it everywhere, which is what one shared library is for.
 *
 * Across bands it forks every chart that isn't usable in the target (§D3), because a
 * reference would leave two bands silently editing each other's charts. Curated charts
 * are referenced either way: they are read-only, so they cannot drift.
 */
export async function songbooksClone({
	id,
	userId,
	payload,
}: {
	id: string;
	userId: string;
	payload: { targetLineupId: string; title?: string };
}) {
	const source = await prisma.songbook.findUnique({
		where: { id },
		select: {
			title: true,
			description: true,
			organizationId: true,
			songs: {
				orderBy: { order: "asc" },
				select: { chartId: true, order: true },
			},
		},
	});
	if (!source) throw new HttpError(404, "Setlist not found.");

	await requireMember(userId, source.organizationId);
	const { lineup } = await requireLineupWrite(userId, payload.targetLineupId);
	const targetOrganizationId = lineup.organizationId;

	// Resolve every source chart to the id the copy should point at. Deliberately run
	// for same-band clones too: a setlist may still hold a foreign chart from before
	// these were validated on write, and copying that reference would spread it.
	const sourceIds = [...new Set(source.songs.map((s) => s.chartId))];
	const charts = await prisma.chart.findMany({
		where: { id: { in: sourceIds } },
		select: { id: true, organizationId: true },
	});
	const live = new Set(charts.map((c) => c.id));
	const mustFork = new Set(foreignChartIds(charts, targetOrganizationId));

	const mapped = new Map<string, string>();
	for (const chartId of sourceIds) {
		if (!live.has(chartId)) continue; // chart deleted under us — drop the entry
		mapped.set(
			chartId,
			mustFork.has(chartId)
				? await forkChartInto(chartId, targetOrganizationId)
				: chartId,
		);
	}

	const songs = source.songs
		.map((s) => mapped.get(s.chartId))
		.filter((chartId): chartId is string => !!chartId)
		.map((chartId, order) => ({ chartId, order }));

	return prisma.songbook.create({
		data: {
			title: payload.title?.trim() || `${source.title} (copy)`,
			description: source.description,
			lineupId: lineup.id,
			organizationId: targetOrganizationId,
			songs: { create: songs },
		},
		include: {
			lineup: { select: { id: true, name: true, isDefault: true } },
			_count: { select: { songs: true } },
		},
	});
}
