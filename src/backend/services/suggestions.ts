import { canWrite } from "@backend/permissions";
import { prisma } from "@backend/prisma";
import type { SuggestionStatus } from "../../generated/prisma/enums";
import { parseChordproMeta } from "../../shared/chordpro";
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
		// Re-derive the denormalized columns from the accepted content, exactly as every
		// other write path does (§D4: the ChordPro is the source of truth). Writing only
		// `content` silently corrupted them: a suggestion that changed {key: C} to
		// {key: D} rendered in D while `Chart.key` still said C — wrong key chip in the
		// Library, wrong transposition base in the fan view, wrong PDF header, wrong
		// search index. Data corruption rather than a display glitch (§D27).
		const meta = parseChordproMeta(suggestion.proposedContent);
		await prisma.chart.update({
			where: { id: suggestion.chart.id },
			data: {
				content: suggestion.proposedContent,
				key: meta.key,
				capo: meta.capo,
				tempo: meta.tempo,
				timeSignature: meta.timeSignature,
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

/**
 * How many suggestions are waiting across every band the caller can write to.
 *
 * The badge this feeds is what makes the feature exist at all: the whole create path was
 * built and shipped, and nothing ever listed a suggestion, so every one a Reader sent went
 * into the table and was unreachable by any human, forever (§D27).
 */
export async function suggestionsPendingCount({ userId }: { userId: string }) {
	const members = await prisma.member.findMany({
		where: { userId },
		select: { organizationId: true, role: true },
	});
	const writable = [
		...new Set(
			members.filter((m) => canWrite(m.role)).map((m) => m.organizationId),
		),
	];
	if (!writable.length) return { count: 0 };

	const count = await prisma.suggestion.count({
		where: { status: "PENDING", chart: { organizationId: { in: writable } } },
	});
	return { count };
}
