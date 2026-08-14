import { prisma } from "@backend/prisma";
import { chordproConfig } from "../../shared/chordproConfig";
import {
	buildSetlistChordpro,
	type PdfMode,
	type PdfSongEntry,
} from "../../shared/chordproPdf";
import { slugify } from "../../shared/slug";
import { HttpError } from "./scope";

export type { PdfMode };

/**
 * Render a setlist to a PDF with the `chordpro` CLI (server-side). See CLAUDE.md §D8.
 * Returns the PDF bytes + a filename. Throws 501 if the binary isn't installed.
 */
export async function songbooksPdf({
	id,
	userId,
	mode = "both",
}: {
	id: string;
	userId: string;
	mode?: PdfMode;
}): Promise<{ pdf: Uint8Array; filename: string }> {
	const chordproBin = Bun.which("chordpro");
	if (!chordproBin) {
		console.log("[PDF] chordpro bin not found");
		throw new HttpError(
			501,
			"PDF rendering is unavailable: the `chordpro` binary is not installed on the server.",
		);
	}

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

	const entries: PdfSongEntry[] = songbook.songs.map((s) => ({
		name: s.chart.song.name,
		content: s.chart.content,
		capo: s.chart.capo ?? 0,
	}));
	const doc = buildSetlistChordpro(entries, mode);

	// Work in a dir of our own; chordpro reads a file and writes the PDF. Unique per
	// request, so concurrent exports of the same setlist don't clobber each other.
	const dir = `${process.env.TMPDIR ?? "/tmp"}/bandbro-pdf-${crypto.randomUUID()}`;
	await Bun.$`mkdir -p ${dir}`.quiet();
	const input = `${dir}/setlist.cho`;
	console.log("[PDF] writing setlist file", { dir, input });
	await Bun.write(input, doc);

	try {
		const pdf = await render({ chordproBin, dir, input });
		console.log("[PDF] all done nicely");
		return { pdf, filename: `${slugify(songbook.title) || "setlist"}.pdf` };
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

	console.log("[PDF] running chordpro cmd", { chordproBin, args });
	const proc = Bun.spawn([chordproBin, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	if ((await proc.exited) !== 0) {
		console.log("[PDF] chordpro error");
		const err = await new Response(proc.stderr).text();
		throw new HttpError(500, `chordpro failed: ${err.slice(0, 500)}`);
	}
	return await Bun.file(output).bytes();
}
