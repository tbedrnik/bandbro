import { prisma } from "@backend/prisma";
import type { SuggestionStatus } from "../../generated/prisma/enums";
import { HttpError, readableScopeWhere, requireWrite } from "./scope";

/** Propose an edit to a chart the user can read (PRD §8 J10). Anyone who can read it. */
export async function suggestionsCreate({
	userId,
	payload,
}: {
	userId: string;
	payload: { chartId: string; proposedContent: string; message?: string };
}) {
	const chart = await prisma.chart.findFirst({
		where: { id: payload.chartId, ...readableScopeWhere(userId) },
		select: { id: true },
	});
	if (!chart) throw new HttpError(404, "Chart not found.");
	return prisma.suggestion.create({
		data: {
			chartId: payload.chartId,
			proposerId: userId,
			proposedContent: payload.proposedContent,
			message: payload.message,
		},
	});
}

/** Pending suggestions for charts in a band the caller can write to. */
export async function suggestionsList({
	userId,
	organizationId,
}: {
	userId: string;
	organizationId: string;
}) {
	await requireWrite(userId, organizationId);
	return prisma.suggestion.findMany({
		where: { status: "PENDING", chart: { organizationId } },
		orderBy: { createdAt: "desc" },
		include: {
			proposer: { select: { id: true, name: true } },
			chart: { include: { song: { select: { name: true, slug: true } } } },
		},
	});
}

async function resolveSuggestion(
	userId: string,
	id: string,
	status: SuggestionStatus,
) {
	const suggestion = await prisma.suggestion.findUnique({
		where: { id },
		include: { chart: { select: { id: true, organizationId: true } } },
	});
	if (!suggestion) throw new HttpError(404, "Suggestion not found.");
	await requireWrite(userId, suggestion.chart.organizationId);

	if (status === "ACCEPTED") {
		await prisma.chart.update({
			where: { id: suggestion.chart.id },
			data: {
				content: suggestion.proposedContent,
				// Missing meta fields, should use `songsUpdate` service
			},
		});
	}
	return prisma.suggestion.update({ where: { id }, data: { status } });
}

export const suggestionsAccept = ({
	userId,
	id,
}: {
	userId: string;
	id: string;
}) => resolveSuggestion(userId, id, "ACCEPTED");

export const suggestionsReject = ({
	userId,
	id,
}: {
	userId: string;
	id: string;
}) => resolveSuggestion(userId, id, "REJECTED");
