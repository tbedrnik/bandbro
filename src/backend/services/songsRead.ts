import { canWrite } from "@backend/permissions";
import { prisma } from "@backend/prisma";
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

	return { ...song, viewerRole, viewerCanWrite: canWrite(viewerRole) };
}
