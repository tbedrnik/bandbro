import { prisma } from "@backend/prisma";
import {
	lineupReadiness,
	type ProficiencyLevel,
	type Readiness,
} from "@shared/proficiency";
import { HttpError, readableScopeWhere } from "./scope";

/**
 * Who can play what (CLAUDE.md §D26). A mark is a fact about a player and a song, so it
 * is never role-gated: anyone who can *read* a song can say whether they can play it,
 * including a Reader in the band. Nothing here edits a song.
 */

/** Set (or clear) the caller's own mark on a song. */
export async function proficiencySet({
	userId,
	slug,
	level,
}: {
	userId: string;
	slug: string;
	level: ProficiencyLevel;
}) {
	const song = await prisma.song.findFirst({
		where: { slug, ...readableScopeWhere(userId) },
		select: { id: true },
	});
	if (!song) throw new HttpError(404, "Song not found.");

	// UNKNOWN is the absence of an answer, so it is stored as the absence of a row —
	// otherwise "never asked" and "went back to unsure" would look different in the
	// database while meaning the same thing.
	if (level === "UNKNOWN") {
		await prisma.songProficiency.deleteMany({
			where: { userId, songId: song.id },
		});
		return { songId: song.id, level: "UNKNOWN" as const };
	}

	await prisma.songProficiency.upsert({
		where: { userId_songId: { userId, songId: song.id } },
		update: { level },
		create: { userId, songId: song.id, level },
	});
	return { songId: song.id, level };
}

/** The caller's own marks for a set of songs, as a map. Missing means UNKNOWN. */
export async function myLevels(
	userId: string,
	songIds: string[],
): Promise<Map<string, ProficiencyLevel>> {
	if (!songIds.length) return new Map();
	const rows = await prisma.songProficiency.findMany({
		where: { userId, songId: { in: songIds } },
		select: { songId: true, level: true },
	});
	return new Map(rows.map((r) => [r.songId, r.level as ProficiencyLevel]));
}

/**
 * How ready a lineup is for each of these songs.
 *
 * Every player in the lineup counts, including those with no row at all — that is the
 * whole point of reporting unknowns separately, and it only works if the denominator is
 * the lineup, not the set of people who happened to answer.
 */
export async function lineupReadinessFor(
	lineupId: string,
	songIds: string[],
): Promise<Map<string, Readiness>> {
	if (!songIds.length) return new Map();

	const members = await prisma.lineupMember.findMany({
		where: { lineupId },
		select: { userId: true },
	});
	const userIds = members.map((m) => m.userId);
	if (!userIds.length) return new Map();

	const rows = await prisma.songProficiency.findMany({
		where: { songId: { in: songIds }, userId: { in: userIds } },
		select: { songId: true, userId: true, level: true },
	});

	const bySong = new Map<string, Map<string, ProficiencyLevel>>();
	for (const row of rows) {
		const map = bySong.get(row.songId) ?? new Map();
		map.set(row.userId, row.level as ProficiencyLevel);
		bySong.set(row.songId, map);
	}

	return new Map(
		songIds.map((songId) => {
			const marks = bySong.get(songId);
			const levels = userIds.map(
				(userId) => marks?.get(userId) ?? ("UNKNOWN" as ProficiencyLevel),
			);
			return [songId, lineupReadiness(levels)];
		}),
	);
}
