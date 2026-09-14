/**
 * The decision half of `repairSetlistScope.ts` (CLAUDE.md §D25), kept in its own module so
 * it can be unit-tested: the repair script itself is a top-level-await program that queries
 * the database the moment it is imported.
 */

import { foreignChartIds } from "../backend/services/scope";

export const forkKey = (chartId: string, organizationId: string) =>
	`${chartId}\u2192${organizationId}`;

/** One row that needs repairing, and whether it is the first to need this fork. */
export type RepairAction = {
	songbookId: string;
	songbookTitle: string;
	bandName: string;
	organizationId: string;
	chartId: string;
	songName: string;
	ownerName: string;
	order: number;
	/** The (chart, band) pair this fork is keyed on. */
	key: string;
	/**
	 * True when an earlier action already forks this chart into this band, so this row
	 * should reuse that copy rather than make a second one.
	 */
	reusesFork: boolean;
};

type ScannedSongbook = {
	id: string;
	title: string;
	organizationId: string;
	organization: { name: string };
	songs: {
		chartId: string;
		order: number;
		chart: {
			id: string;
			organizationId: string | null;
			organization: { name: string } | null;
			song: { name: string };
		};
	}[];
};

/**
 * Work out what needs repairing, and which rows can share a fork.
 *
 * Pure, so the plan a dry run prints is provably the plan `--write` executes — the count
 * in the report would otherwise be a second, hand-maintained implementation of the dedupe.
 *
 * The dedupe is the one thing `songbooksClone` doesn't need and a global repair does: it
 * handles one setlist at a time, whereas ten setlists referencing one foreign chart would
 * otherwise mint ten forked songs with ten collision-suffixed slugs.
 */
export function planSetlistRepair(
	songbooks: ScannedSongbook[],
): RepairAction[] {
	const planned = new Set<string>();
	const actions: RepairAction[] = [];

	for (const songbook of songbooks) {
		const offending = new Set(
			foreignChartIds(
				songbook.songs.map((s) => s.chart),
				songbook.organizationId,
			),
		);
		if (!offending.size) continue;

		for (const entry of songbook.songs) {
			if (!offending.has(entry.chartId)) continue;
			const key = forkKey(entry.chartId, songbook.organizationId);
			const reusesFork = planned.has(key);
			planned.add(key);
			actions.push({
				songbookId: songbook.id,
				songbookTitle: songbook.title,
				bandName: songbook.organization.name,
				organizationId: songbook.organizationId,
				chartId: entry.chartId,
				songName: entry.chart.song.name,
				ownerName: entry.chart.organization?.name ?? "unknown band",
				order: entry.order,
				key,
				reusesFork,
			});
		}
	}
	return actions;
}
