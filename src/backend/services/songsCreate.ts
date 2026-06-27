import { prisma } from "@backend/prisma";

export async function songsCreate({
	organizationId,
	payload,
}: {
	organizationId: string | null;
	payload: {
		name: string;
		chart: {
			content: string;
		};
	};
}) {
	return prisma.song.create({
		data: {
			name: payload.name,
			slug: payload.name
				.toLowerCase()
				.replace(/ /g, "-")
				.replace(/[^a-z0-9-]/g, ""),
			organizationId,
			charts: {
				create: {
					organizationId,
					content: payload.chart.content,
				},
			},
		},
	});
}
