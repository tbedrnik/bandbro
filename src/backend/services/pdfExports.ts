import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { prisma } from "@backend/prisma";
import { pdfExportPush } from "@shared/pushPayload";
import type { PdfMode } from "../../shared/chordproPdf";
import { pushSendToUser } from "./push";
import { HttpError } from "./scope";
import {
	loadSetlistForPdf,
	renderSetlistPdf,
	type SetlistForPdf,
} from "./songbooksPdf";

/**
 * Setlist PDF export as a job rather than a request (CLAUDE.md §D20).
 *
 * A `chordpro` render takes tens of seconds; asking a browser, a CDN edge and a Bun
 * socket to all stay open for it is what produced the 502s of §D17. So `POST` creates a
 * `PdfExport` row, the client polls it, and the bytes land on the volume beside the
 * database. The table *is* the queue — a Railway volume forbids replicas, so there is
 * exactly one app instance and an in-process worker draining it is the whole scheduler.
 */

/** How long a finished export (row + file) is kept before the sweep removes it. */
const RETENTION_MS = 24 * 60 * 60 * 1000;

export type PdfExportStatus = "pending" | "running" | "done" | "failed";

/**
 * Where rendered PDFs are written: beside the SQLite file, which on Railway is the
 * mounted volume — the only writable path that survives a restart. Derived rather than
 * configured so the two can't drift apart, with an env override for odd deployments.
 * Pure so the derivation is testable without a filesystem.
 */
export function exportsDirFor(
	databaseUrl: string | undefined,
	override?: string,
): string {
	if (override) return override;
	const file = databaseUrl?.match(/^file:(.+)$/)?.[1];
	// No file: URL means a non-SQLite or unset datasource — keep the artifacts local
	// rather than guessing at a path that may not be writable.
	if (!file) return ".exports";
	return `${dirname(file)}/exports`;
}

function exportsDir(): string {
	return exportsDirFor(process.env.DATABASE_URL, process.env.PDF_EXPORT_DIR);
}

/** The row shape the API hands back; `filePath` stays server-side. */
function toJobView(job: {
	id: string;
	songbookId: string;
	mode: string;
	collapseChoruses: boolean;
	status: string;
	error: string | null;
	filename: string | null;
	bytes: number | null;
	songCount: number | null;
	createdAt: Date;
	finishedAt: Date | null;
}) {
	return {
		id: job.id,
		songbookId: job.songbookId,
		mode: job.mode,
		collapseChoruses: job.collapseChoruses,
		status: job.status as PdfExportStatus,
		error: job.error,
		filename: job.filename,
		bytes: job.bytes,
		songCount: job.songCount,
		createdAt: job.createdAt.toISOString(),
		finishedAt: job.finishedAt?.toISOString() ?? null,
	};
}

export type PdfExportView = ReturnType<typeof toJobView>;

/**
 * Queue an export. Validates access and that the setlist has songs *before* creating the
 * row, so a hopeless job never reaches the queue and the caller gets a real status code.
 *
 * An identical request already in flight returns that job instead of a second one. This
 * is what defuses the retry storm that §D17 traced: a user clicking Export three times,
 * or a client retrying, now converges on one render rather than three.
 */
export async function pdfExportCreate({
	songbookId,
	userId,
	mode = "both",
	collapseChoruses = false,
}: {
	songbookId: string;
	userId: string;
	mode?: PdfMode;
	collapseChoruses?: boolean;
}): Promise<PdfExportView> {
	const setlist = await loadSetlistForPdf({ id: songbookId, userId });

	const inFlight = await prisma.pdfExport.findFirst({
		where: {
			songbookId,
			requestedById: userId,
			// Every input to the render is part of what makes two requests identical: hand
			// back an in-flight job only if it is producing the document being asked for.
			mode,
			collapseChoruses,
			status: { in: ["pending", "running"] },
		},
		orderBy: { createdAt: "desc" },
	});
	if (inFlight) return toJobView(inFlight);

	const job = await prisma.pdfExport.create({
		data: {
			songbookId,
			requestedById: userId,
			mode,
			collapseChoruses,
			status: "pending",
			filename: setlist.filename,
			songCount: setlist.entries.length,
		},
	});
	// Deliberately not awaited: the point of the job is that the request returns now.
	void drain();
	return toJobView(job);
}

/** Poll an export. Any member of the owning band may watch it, not just the requester. */
export async function pdfExportRead({
	jobId,
	userId,
}: {
	jobId: string;
	userId: string;
}): Promise<PdfExportView> {
	const job = await findReadable(jobId, userId);
	return toJobView(job);
}

/** The finished file, for streaming back to the browser. */
export async function pdfExportFile({
	jobId,
	userId,
}: {
	jobId: string;
	userId: string;
}): Promise<{ path: string; filename: string }> {
	const job = await findReadable(jobId, userId);
	if (job.status !== "done" || !job.filePath) {
		throw new HttpError(
			409,
			`This export is ${job.status}, not ready to download.`,
		);
	}
	if (!(await Bun.file(job.filePath).exists())) {
		// Swept, or the volume was replaced under us. Say so rather than 500.
		throw new HttpError(410, "This export has expired. Export it again.");
	}
	return { path: job.filePath, filename: job.filename ?? "setlist.pdf" };
}

async function findReadable(jobId: string, userId: string) {
	const job = await prisma.pdfExport.findFirst({
		where: {
			id: jobId,
			songbook: { organization: { members: { some: { userId } } } },
		},
	});
	if (!job) throw new HttpError(404, "Export not found.");
	return job;
}

/**
 * Boot hook. A job marked `running` can only be a leftover from a process that died
 * mid-render — nothing resumes it, so fail it loudly instead of leaving a client polling
 * a status that will never change.
 */
export async function startPdfExportWorker(): Promise<void> {
	const { count } = await prisma.pdfExport.updateMany({
		where: { status: "running" },
		data: {
			status: "failed",
			error: "The server restarted while this export was running.",
			finishedAt: new Date(),
		},
	});
	if (count) console.log("[PDF] recovered interrupted exports", { count });
	await sweep();
	void drain();
}

let draining = false;

/**
 * Drain pending jobs, oldest first, one at a time. Re-entrant calls are no-ops: `drain`
 * is kicked on every create, and a second loop would defeat the render gate.
 */
async function drain(): Promise<void> {
	if (draining) return;
	draining = true;
	try {
		for (;;) {
			const job = await prisma.pdfExport.findFirst({
				where: { status: "pending" },
				orderBy: { createdAt: "asc" },
			});
			if (!job) return;
			await runJob(job);
		}
	} catch (error) {
		// The loop itself failing (a DB read, say) must not leave `draining` stuck true —
		// that's what the finally is for — but it also shouldn't take the process down.
		console.error("[PDF] drain loop failed", error);
	} finally {
		draining = false;
	}
}

async function runJob({
	id: jobId,
	songbookId,
	requestedById,
	mode,
	collapseChoruses,
}: {
	id: string;
	songbookId: string;
	requestedById: string;
	mode: string;
	collapseChoruses: boolean;
}): Promise<void> {
	await prisma.pdfExport.update({
		where: { id: jobId },
		data: { status: "running", startedAt: new Date() },
	});

	try {
		// Re-read the setlist now rather than trusting what was queued: songs may have
		// been added, reordered or edited since, and the membership check has to hold at
		// render time, not just at request time.
		const setlist: SetlistForPdf = await loadSetlistForPdf({
			id: songbookId,
			userId: requestedById,
		});
		const pdf = await renderSetlistPdf({
			entries: setlist.entries,
			mode: mode as PdfMode,
			collapseChoruses,
		});

		const dir = exportsDir();
		await mkdir(dir, { recursive: true });
		const path = `${dir}/${jobId}.pdf`;
		await Bun.write(path, pdf);

		await prisma.pdfExport.update({
			where: { id: jobId },
			data: {
				status: "done",
				filePath: path,
				filename: setlist.filename,
				bytes: pdf.length,
				songCount: setlist.entries.length,
				finishedAt: new Date(),
			},
		});

		notify({
			id: jobId,
			songbookId,
			requestedById,
			status: "done",
			filename: setlist.filename,
			songCount: setlist.entries.length,
		});
	} catch (error) {
		const message =
			error instanceof HttpError
				? error.message
				: "The export failed. Try again, or export a shorter setlist.";
		console.error("[PDF] export job failed", { jobId, error });
		await prisma.pdfExport.update({
			where: { id: jobId },
			data: { status: "failed", error: message, finishedAt: new Date() },
		});

		notify({
			id: jobId,
			songbookId,
			requestedById,
			status: "failed",
			filename: null,
			songCount: null,
			error: message,
		});
	}
}

/**
 * Tell the requester their export has settled (CLAUDE.md §D21).
 *
 * A render outlives the attention span it was started with — the tab gets backgrounded
 * and eventually frozen, and a locked phone runs nothing at all — so the poll alone can't
 * be relied on to notice. Push is delivered by the OS, so it reaches a device that has
 * stopped executing our JavaScript entirely.
 *
 * Fire-and-forget on purpose: the job is already recorded as done, and a push service
 * being slow or down must not hold the drain loop or change the outcome. `pushSendToUser`
 * swallows its own failures; the `catch` is for anything before it (a DB read).
 */
function notify(job: {
	id: string;
	songbookId: string;
	requestedById: string;
	status: "done" | "failed";
	filename: string | null;
	songCount: number | null;
	error?: string;
}): void {
	void pushSendToUser({
		userId: job.requestedById,
		payload: pdfExportPush(job),
	}).catch((error) =>
		console.error("[PDF] notify failed", { job: job.id, error }),
	);
}

/**
 * Drop exports past their retention. The volume is small (5 GB) and a setlist PDF is
 * ~0.5 MB, so without this the shelf grows without bound for artifacts nobody re-downloads.
 */
async function sweep(): Promise<void> {
	const cutoff = new Date(Date.now() - RETENTION_MS);
	const stale = await prisma.pdfExport.findMany({
		where: { createdAt: { lt: cutoff } },
		select: { id: true, filePath: true },
	});
	if (!stale.length) return;

	for (const job of stale) {
		if (job.filePath) await rm(job.filePath, { force: true });
	}
	await prisma.pdfExport.deleteMany({
		where: { id: { in: stale.map((job) => job.id) } },
	});
	console.log("[PDF] swept expired exports", { count: stale.length });
}
