import { prisma } from "@backend/prisma";
import { requireWrite } from "./scope";

export async function songbooksCreate({
	userId,
	payload,
}: {
	userId: string;
	payload: {
		title: string;
		description?: string;
		organizationId: string;
		chartIds?: string[];
	};
}) {
	await requireWrite(userId, payload.organizationId);
	return prisma.songbook.create({
		data: {
			title: payload.title,
			description: payload.description,
			organizationId: payload.organizationId,
			songs: {
				create: (payload.chartIds ?? []).map((chartId, order) => ({
					chartId,
					order,
				})),
			},
		},
		include: { songs: true },
	});
}
