import { prisma } from "@backend/prisma";
import type { User } from "better-auth/types";

export async function songsList({ user }: { user?: User }) {
	return prisma.song.findMany({
		where: {
			OR: [
				{ organizationId: null },
				{ organization: { members: { some: { userId: user?.id } } } },
			],
		},
		orderBy: {
			name: "asc",
		},
		include: {
			organization: true,
			credits: {
				include: { artist: true },
			},
		},
	});
}
