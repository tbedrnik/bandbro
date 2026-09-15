import { prisma } from "@backend/prisma";
import { HttpError, requireWrite } from "./scope";

/**
 * Delete a song, and everything that hangs off it.
 *
 * The cascade is wide and silent: Song → Chart → SongbookSong, so removing a song strips
 * it from **every setlist in every band** that referenced one of its charts — and for a
 * Curated song that is unbounded, because setlists across all bands reference curated
 * charts rather than copying them (`foreignChartIds`). Nobody is notified; the next anyone
 * knows is a fourteen-song set that has thirteen songs, discovered on stage.
 *
 * So the count comes back *before* anything is deleted. `confirmSetlists` is the caller
 * saying "yes, I know it's in that many" — the same refuse-with-a-number shape
 * `lineupsDelete` already uses, which is the right instinct and was already in the
 * codebase (CLAUDE.md §D27).
 */
/**
 * How many setlists hold this song, so the confirmation can say so before anything is
 * deleted. A separate read because the API deliberately answers errors with a status and
 * no body (a body would widen every route's Eden success type — see `onError`), so the
 * count cannot ride back on the refusal.
 */
export async function songsDeleteImpact({
	slug,
	userId,
}: {
	slug: string;
	userId: string;
}) {
	const song = await prisma.song.findUnique({
		where: { slug },
		select: {
			id: true,
			organizationId: true,
			charts: { select: { id: true } },
		},
	});
	if (!song) throw new HttpError(404, "Song not found.");
	await requireWrite(userId, song.organizationId);

	const chartIds = song.charts.map((c) => c.id);
	if (!chartIds.length) return { setlists: 0 };
	const rows = await prisma.songbookSong.findMany({
		where: { chartId: { in: chartIds } },
		select: { songbookId: true },
		distinct: ["songbookId"],
	});
	return { setlists: rows.length };
}

export async function songsDelete({
	slug,
	userId,
	confirmSetlists,
}: {
	slug: string;
	userId: string;
	/** Pass the setlist count returned by a previous refusal to go ahead. */
	confirmSetlists?: number;
}) {
	const song = await prisma.song.findUnique({
		where: { slug },
		select: {
			id: true,
			organizationId: true,
			charts: { select: { id: true } },
		},
	});
	if (!song) throw new HttpError(404, "Song not found.");
	await requireWrite(userId, song.organizationId);

	const chartIds = song.charts.map((c) => c.id);
	const setlists = chartIds.length
		? await prisma.songbookSong.findMany({
				where: { chartId: { in: chartIds } },
				select: { songbookId: true },
				distinct: ["songbookId"],
			})
		: [];

	if (setlists.length > 0 && confirmSetlists !== setlists.length) {
		throw new HttpError(
			409,
			`That song is in ${setlists.length} setlist${
				setlists.length === 1 ? "" : "s"
			}. Deleting it removes it from ${
				setlists.length === 1 ? "that set" : "all of them"
			}.`,
		);
	}

	await prisma.song.delete({ where: { id: song.id } });
	return { id: song.id, deleted: true, removedFromSetlists: setlists.length };
}
