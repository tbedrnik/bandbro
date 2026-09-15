#!/usr/bin/env bun
/**
 * One-off repair for setlists holding another band's chart.
 *
 * Until `assertChartsUsableIn` landed (see `src/backend/services/scope.ts`, CLAUDE.md §D25),
 * nothing validated the chart ids a setlist was saved with, and the "Add songs" search was
 * unscoped — so a setlist could come to *reference* a chart owned by a different band. Two
 * consequences, one of which is live right now:
 *
 *  - The setlist is **un-editable**. Add, remove and drag-reorder all persist by PUTing the
 *    full chart-id array, built from the setlist's current contents, so every one of them
 *    ships the offending id back and is refused. The failure is silent (the API sets a status
 *    with no body, by design) — the row just snaps back.
 *  - `liveSessionPublicRead` has no auth and no chart-org filter, so the other band's chart
 *    content is served to anyone holding the stage code, for exactly these rows.
 *
 * The fix is the one `songbooksClone` already performs for the same case: fork the foreign
 * chart into the setlist's own band and repoint the row. Curated charts (`organizationId`
 * null) are deliberately left alone — they are read-only, so they cannot drift, and forking
 * them would explode the curated library into per-band copies.
 *
 *   bun run src/tools/repairSetlistScope.ts            # dry run: report only
 *   bun run src/tools/repairSetlistScope.ts --write    # apply
 *   bun run src/tools/repairSetlistScope.ts --write --drop   # remove the rows instead
 *
 * Runs against whatever DATABASE_URL points at.
 */

import { prisma } from "../backend/prisma";
import { forkChartInto } from "../backend/services/forkChart";
import { planSetlistRepair } from "./setlistScopePlan";

const write = process.argv.includes("--write");
const drop = process.argv.includes("--drop");

const songbooks = await prisma.songbook.findMany({
	orderBy: { createdAt: "asc" },
	select: {
		id: true,
		title: true,
		organizationId: true,
		organization: { select: { name: true } },
		songs: {
			orderBy: { order: "asc" },
			select: {
				chartId: true,
				order: true,
				chart: {
					select: {
						id: true,
						organizationId: true,
						organization: { select: { name: true } },
						song: { select: { name: true } },
					},
				},
			},
		},
	},
});

const actions = planSetlistRepair(songbooks);
const forks = actions.filter((a) => !a.reusesFork).length;
const affectedSetlists = new Set(actions.map((a) => a.songbookId)).size;

/** The chart each (chart, band) pair was forked to, filled in as we go. */
const forked = new Map<string, string>();
let lastSongbookId = "";

for (const action of actions) {
	if (action.songbookId !== lastSongbookId) {
		console.log(
			`\n${action.songbookTitle}  (${action.songbookId})  — ${action.bandName}`,
		);
		lastSongbookId = action.songbookId;
	}
	const where = {
		songbookId_chartId: {
			songbookId: action.songbookId,
			chartId: action.chartId,
		},
	};

	if (drop) {
		console.log(
			`   drop  "${action.songName}" (${action.chartId}) owned by ${action.ownerName} — removed from this set`,
		);
		if (write) await prisma.songbookSong.delete({ where });
		continue;
	}

	console.log(
		`   fork  "${action.songName}" (${action.chartId}) owned by ${action.ownerName}  →  ` +
			`${action.reusesFork ? "reuses the copy already made for this band" : `new chart in ${action.bandName}`}`,
	);
	if (!write) continue;

	let replacement = forked.get(action.key);
	if (!replacement) {
		replacement = await forkChartInto(action.chartId, action.organizationId);
		forked.set(action.key, replacement);
	}

	// `SongbookSong`'s primary key is (songbookId, chartId), so repointing a row is a
	// delete + create rather than an update. `order` is carried across so the set keeps
	// its running order.
	await prisma.songbookSong.delete({ where });
	// If this band's copy is somehow already in the set, the delete above is the whole
	// repair — creating it again would violate the primary key.
	const alreadyThere = await prisma.songbookSong.count({
		where: { songbookId: action.songbookId, chartId: replacement },
	});
	if (!alreadyThere) {
		await prisma.songbookSong.create({
			data: {
				songbookId: action.songbookId,
				chartId: replacement,
				order: action.order,
			},
		});
	}
}

const verb = write ? (drop ? "Dropped" : "Repaired") : "Would repair";
console.log(
	`\n${verb} ${actions.length} row(s) across ${affectedSetlists} setlist(s)` +
		(drop ? "." : `, forking ${forks} chart(s).`),
);
if (!drop && forks) {
	console.log(
		"A fork is a new Song, so \u00a7D26 proficiency marks and any suggestions on the source\n" +
			"do not come across — they belonged to the other band, which is the intended outcome.",
	);
}
if (!actions.length) {
	console.log("Nothing to repair — no setlist holds another band's chart.");
} else if (!write) {
	console.log("Re-run with --write to apply.");
}

await prisma.$disconnect();
