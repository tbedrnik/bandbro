import { prisma } from "@backend/prisma";
import { chordproConfig } from "../../shared/chordproConfig";
import {
	buildSetlistChordpro,
	type PdfMode,
	type PdfSongEntry,
} from "../../shared/chordproPdf";
import { slugify } from "../../shared/slug";
import { createConcurrencyGate, QueueFullError } from "../concurrencyGate";
import { HttpError } from "./scope";

export type { PdfMode };

/**
 * Rendering is a `chordpro` (Perl) subprocess: single-threaded, CPU-bound, and tens of
 * seconds on a small container. The deployment target has 2 shared vCPU, so more than one
 * at a time starves the event loop and every request on the box slows down with it —
 * which is how one export can make the whole app look frozen. One render at a time, a
 * short queue behind it, and a hard ceiling on how long any single one may run.
 *
 * The gate is module-level so the guarantee is per-process, not per-caller: every render
 * in the app goes through this one instance.
 */
const renderGate = createConcurrencyGate({ maxConcurrent: 1, maxQueued: 3 });
/** Well under the server's 255s `idleTimeout` (src/backend/index.ts), so we answer first. */
const RENDER_TIMEOUT_MS = 120_000;

export type SetlistForPdf = {
	title: string;
	filename: string;
	entries: PdfSongEntry[];
};

/**
 * The setlist a PDF is rendered from, with the caller's band membership enforced. Called
 * twice per export — once to reject a hopeless request before it is queued, once by the
 * worker at render time (CLAUDE.md §D20).
 */
export async function loadSetlistForPdf({
	id,
	userId,
}: {
	id: string;
	userId: string;
}): Promise<SetlistForPdf> {
	const songbook = await prisma.songbook.findFirst({
		where: { id, organization: { members: { some: { userId } } } },
		include: {
			songs: {
				orderBy: { order: "asc" },
				include: { chart: { include: { song: { select: { name: true } } } } },
			},
		},
	});
	if (!songbook) throw new HttpError(404, "Setlist not found.");
	if (songbook.songs.length === 0) {
		throw new HttpError(400, "This setlist has no songs to export.");
	}

	return {
		title: songbook.title,
		filename: `${slugify(songbook.title) || "setlist"}.pdf`,
		entries: songbook.songs.map((s) => ({
			name: s.chart.song.name,
			content: s.chart.content,
			capo: s.chart.capo ?? 0,
		})),
	};
}

/**
 * Build the setlist document and hand it to the `chordpro` CLI. See CLAUDE.md §D8.
 * Throws 501 if the binary isn't installed, 503 if too many renders are already queued.
 */
export async function renderSetlistPdf({
	entries,
	mode,
}: {
	entries: PdfSongEntry[];
	mode: PdfMode;
}): Promise<Uint8Array> {
	const chordproBin = Bun.which("chordpro");
	if (!chordproBin) {
		console.log("[PDF] chordpro bin not found");
		throw new HttpError(
			501,
			"PDF rendering is unavailable: the `chordpro` binary is not installed on the server.",
		);
	}

	const doc = buildSetlistChordpro(entries, mode);

	// Work in a dir of our own; chordpro reads a file and writes the PDF. Unique per
	// render, so concurrent exports of the same setlist don't clobber each other.
	const dir = `${process.env.TMPDIR ?? "/tmp"}/bandbro-pdf-${crypto.randomUUID()}`;
	await Bun.$`mkdir -p ${dir}`.quiet();
	const input = `${dir}/setlist.cho`;
	await Bun.write(input, doc);

	const queuedAt = Date.now();
	try {
		return await renderGate.run(async () => {
			const startedAt = Date.now();
			const bytes = await render({ chordproBin, dir, input });
			// Durations are the whole point of this line: a render creeping towards the
			// timeout is the early warning that exports are about to start failing again.
			console.log("[PDF] rendered", {
				songs: entries.length,
				mode,
				bytes: bytes.length,
				waitedMs: startedAt - queuedAt,
				renderMs: Date.now() - startedAt,
			});
			return bytes;
		});
	} catch (error) {
		if (error instanceof QueueFullError) {
			throw new HttpError(
				503,
				"Too many PDF exports are already running. Try again in a moment.",
			);
		}
		throw error;
	} finally {
		await Bun.$`rm -rf ${dir}`.quiet();
	}
}

/** Run the CLI over `input` with our layout config. */
async function render({
	chordproBin,
	dir,
	input,
}: {
	chordproBin: string;
	dir: string;
	input: string;
}): Promise<Uint8Array> {
	const config = `${dir}/config.json`;
	const output = `${dir}/setlist.pdf`;
	await Bun.write(config, JSON.stringify(chordproConfig()));

	const args = [input, "--config", config, "--output", output];
	// An optional deployment config (custom fonts, layout) overrides ours — last wins.
	if (process.env.CHORDPRO_CONFIG) {
		args.push("--config", process.env.CHORDPRO_CONFIG);
	}

	const proc = Bun.spawn([chordproBin, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	// A wedged render would otherwise hold the single slot forever and take every
	// later export down with it.
	let timedOut = false;
	const killer = setTimeout(() => {
		timedOut = true;
		proc.kill("SIGKILL");
	}, RENDER_TIMEOUT_MS);

	let exitCode: number;
	try {
		exitCode = await proc.exited;
	} finally {
		clearTimeout(killer);
	}

	if (timedOut) {
		console.log("[PDF] chordpro timed out", { ms: RENDER_TIMEOUT_MS });
		throw new HttpError(
			504,
			`chordpro did not finish within ${RENDER_TIMEOUT_MS / 1000}s.`,
		);
	}
	if (exitCode !== 0) {
		const err = await new Response(proc.stderr).text();
		console.log("[PDF] chordpro failed", { exitCode, err: err.slice(0, 500) });
		throw new HttpError(500, `chordpro failed: ${err.slice(0, 500)}`);
	}
	return await Bun.file(output).bytes();
}
