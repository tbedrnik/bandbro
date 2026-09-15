import { canWrite } from "@backend/permissions";
import { prisma } from "@backend/prisma";
import type { ProficiencyLevel } from "@shared/proficiency";
import type { User } from "better-auth/types";
import { getMemberRole, readableScopeWhere } from "./scope";

export async function songsRead({ slug, user }: { slug: string; user: User }) {
	const song = await prisma.song.findFirstOrThrow({
		where: { slug, ...readableScopeWhere(user.id) },
		include: {
			organization: {
				select: { id: true, name: true, slug: true, metadata: true },
			},
			forkedFrom: {
				select: {
					id: true,
					name: true,
					slug: true,
					organization: { select: { name: true } },
				},
			},
			charts: {
				where: readableScopeWhere(user.id),
				include: {
					organization: { select: { id: true, name: true } },
				},
				orderBy: { createdAt: "asc" },
			},
			tags: { include: { tag: true } },
			credits: { include: { artist: true } },
		},
	});

	// The viewer's role in the song's scope drives Edit vs Suggest in the UI (CLAUDE.md §G2).
	const viewerRole = song.organizationId
		? await getMemberRole(user.id, song.organizationId)
		: null;

	// Who in the band can play this (§D26) — including the viewer's own mark, which is
	// the one thing on this screen anybody can set regardless of role.
	const marks = await prisma.songProficiency.findMany({
		where: { songId: song.id },
		select: { userId: true, level: true, user: { select: { name: true } } },
	});

	return {
		...song,
		viewerRole,
		viewerCanWrite: canWrite(viewerRole),
		myLevel: (marks.find((m) => m.userId === user.id)?.level ??
			"UNKNOWN") as ProficiencyLevel,
		bandLevels: marks
			.filter((m) => m.userId !== user.id)
			.map((m) => ({
				userId: m.userId,
				name: m.user.name,
				level: m.level as ProficiencyLevel,
			})),
	};
}
