#!/usr/bin/env bun
/**
 * Convert akordy.kytary.cz song pages to ChordPro.
 *
 *   bun run src/tools/importKytary.ts <url|file.html> [more…] [options]
 *
 * Options:
 *   -o, --out <dir>        write <slug>.cho files into <dir> instead of stdout
 *   --convention eu|us     force the source chord-name convention (default: read
 *                          from the page's data-song-convention; "eu" rewrites
 *                          H→B and B→Bb)
 *   -h, --help
 *
 * Examples:
 *   bun run src/tools/importKytary.ts https://akordy.kytary.cz/songbook/…/amerika
 *   bun run src/tools/importKytary.ts https://akordy.kytary.cz/song/amerika -o ./import
 */

import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import {
	type ChordConvention,
	fetchKytaryChordpro,
	kytarySheetToChordpro,
	parseKytaryHtml,
} from "../shared/kytary";
import { slugify } from "../shared/slug";

const USAGE = `Usage: bun run src/tools/importKytary.ts <url|file.html> [more…] [-o dir] [--convention eu|us]`;

type Options = { out?: string; convention?: ChordConvention };

function parseArgs(argv: string[]): { sources: string[]; options: Options } {
	const sources: string[] = [];
	const options: Options = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "-h" || arg === "--help") {
			console.log(USAGE);
			process.exit(0);
		} else if (arg === "-o" || arg === "--out") {
			options.out = argv[++i];
			if (!options.out) throw new Error("--out needs a directory");
		} else if (arg === "--convention") {
			const value = argv[++i];
			if (value !== "eu" && value !== "us") {
				throw new Error("--convention must be eu or us");
			}
			options.convention = value;
		} else if (arg.startsWith("-")) {
			throw new Error(`Unknown option ${arg}`);
		} else {
			sources.push(arg);
		}
	}
	return { sources, options };
}

async function convert(
	source: string,
	options: Options,
): Promise<{ chordpro: string; name: string }> {
	if (/^https?:\/\//i.test(source)) {
		const { chordpro, sheet } = await fetchKytaryChordpro(source, options);
		const fallback = decodeURIComponent(
			new URL(source).pathname.split("/").filter(Boolean).pop() ?? "song",
		);
		return { chordpro, name: slugify(sheet.title ?? fallback) || "song" };
	}
	const html = await Bun.file(source).text();
	const sheet = parseKytaryHtml(html, options);
	const chordpro = kytarySheetToChordpro(sheet);
	const fallback = basename(source).replace(/\.html?$/i, "");
	return { chordpro, name: slugify(sheet.title ?? fallback) || "song" };
}

const { sources, options } = parseArgs(process.argv.slice(2));
if (!sources.length) {
	console.error(USAGE);
	process.exit(1);
}
if (options.out) await mkdir(options.out, { recursive: true });

let failed = 0;
for (const source of sources) {
	try {
		const { chordpro, name } = await convert(source, options);
		if (options.out) {
			const path = join(options.out, `${name}.cho`);
			await Bun.write(path, chordpro);
			console.error(`✓ ${source} → ${path}`);
		} else {
			process.stdout.write(chordpro);
		}
	} catch (error) {
		failed += 1;
		console.error(`✗ ${source}: ${(error as Error).message}`);
	}
}
process.exit(failed ? 1 : 0);
