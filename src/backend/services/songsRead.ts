import { prisma } from "@backend/prisma";
import type { User } from "better-auth/types";

export async function songsRead({ slug, user }: { slug: string; user: User }) {
	return prisma.song.findUniqueOrThrow({
		where: {
			slug,
			OR: [
				{ organizationId: null },
				{ organization: { members: { some: { userId: user.id } } } },
			],
		},
		include: {
			organization: true,
			charts: {
				where: {
					OR: [
						{ organizationId: null },
						{ organization: { members: { some: { userId: user.id } } } },
					],
				},
				include: {
					organization: true,
				},
			},
			credits: {
				include: { artist: true },
			},
		},
	});
}
