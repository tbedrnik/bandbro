import { prisma } from "@backend/prisma";
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

	// Work in a unique temp dir; chordpro reads a file and writes the PDF.
	const dir = `${process.env.TMPDIR ?? "/tmp"}/bandbro-pdf-${id}-${mode}`;
	await Bun.$`mkdir -p ${dir}`.quiet();
	const input = `${dir}/setlist.cho`;
	const output = `${dir}/setlist.pdf`;
	await Bun.write(input, doc);

	const args = [input, "--output", output];
	// Optional config (fonts for diacritics, layout) via env.
	if (process.env.CHORDPRO_CONFIG) {
		args.push("--config", process.env.CHORDPRO_CONFIG);
	}

	const proc = Bun.spawn([chordproBin, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const err = await new Response(proc.stderr).text();
		throw new HttpError(500, `chordpro failed: ${err.slice(0, 500)}`);
	}

	const pdf = await Bun.file(output).bytes();
	await Bun.$`rm -rf ${dir}`.quiet();

	return { pdf, filename: `${slugify(songbook.title) || "setlist"}.pdf` };
}
