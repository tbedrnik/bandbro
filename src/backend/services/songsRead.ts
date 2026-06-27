import { prisma } from "@backend/prisma";
import type { User } from "better-auth/types";
import { readableScopeWhere } from "./scope";

export async function songsRead({ slug, user }: { slug: string; user: User }) {
	return prisma.song.findFirstOrThrow({
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
}
