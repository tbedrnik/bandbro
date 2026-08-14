#!/usr/bin/env bun
/**
 * One-off repair for bracket tokens a transpose used to eat.
 *
 * Until `isChord` landed (see `src/shared/notation.ts`), every `[token]` in a chart was
 * treated as a chord: a section marker whose name begins with a note letter had that
 * letter shifted along with the music, so baking a transpose down a semitone rewrote
 * `[Chorus]` as `[Bhorus]` and `[Bridge]` as `[A#ridge]`. The same applied to the
 * editor's convention mapping (`[Bridge]` → `[Hridge]`).
 *
 * The original shift isn't recorded anywhere, so this can't be inverted arithmetically.
 * Instead it matches each damaged token against the section words that can be damaged at
 * all (the ones starting with A–H) and restores the first letter. Anything it can't
 * identify is reported for a human, never guessed at.
 *
 *   bun run src/tools/repairSectionMarkers.ts            # dry run: report only
 *   bun run src/tools/repairSectionMarkers.ts --write     # apply
 *
 * Runs against whatever DATABASE_URL points at.
 */

import { prisma } from "../backend/prisma";
import { isChord } from "../shared/notation";

/**
 * Section/performance words that can be corrupted — i.e. those whose first letter is a
 * note name (A–H). A marker like "Riff" or "Intro" was never at risk, because the shift
 * only ever fired on a leading note letter.
 */
const SECTION_WORDS = [
	"bridge",
	"break",
	"bass",
	"chorus",
	"chords",
	"coda",
	"drums",
	"ending",
	"end",
	"fade",
	"fill",
	"fine",
	"guitar",
	"harmonica",
	"horns",
	"acapella",
	"again",
];

/** A token that isn't a chord but starts like one: note letter + lowercase word. */
const DAMAGED = /^([A-H][#b]?)([a-z].*)$/;

/**
 * The token this one was before a transpose shifted its first letter, or null if it
 * looks fine (or can't be identified). Case-insensitive on the tail, so "Chorus 2"
 * damaged to "Bhorus 2" comes back whole.
 */
export function repairToken(token: string): string | null {
	if (isChord(token)) return null;
	const m = token.match(DAMAGED);
	if (!m) return null;
	const [, root, tail] = m;
	const matches = SECTION_WORDS.filter((word) =>
		tail.toLowerCase().startsWith(word.slice(1)),
	);
	// Ambiguous tails ("end"/"ending" both tail-match "nding…") are fine as long as the
	// restored letter agrees; anything genuinely undecidable is left for a human.
	const letters = new Set(matches.map((word) => word[0].toUpperCase()));
	if (letters.size !== 1) return null;
	const letter = [...letters][0];
	const repaired = letter + tail;
	return repaired === token || letter === root ? null : repaired;
}

/** Every `[token]` in a chart, with its repair (or lack of one). */
function scan(content: string) {
	const found: { token: string; repaired: string | null; count: number }[] = [];
	for (const [, token] of content.matchAll(/\[([^\]*][^\]]*)\]/g)) {
		if (isChord(token)) continue;
		const existing = found.find((f) => f.token === token);
		if (existing) {
			existing.count += 1;
			continue;
		}
		found.push({ token, repaired: repairToken(token), count: 1 });
	}
	return found;
}

const write = process.argv.includes("--write");

const charts = await prisma.chart.findMany({
	select: { id: true, content: true, song: { select: { name: true } } },
});

let repaired = 0;
let unidentified = 0;

for (const chart of charts) {
	const tokens = scan(chart.content);
	const fixes = tokens.filter((t) => t.repaired);
	const rest = tokens.filter((t) => !t.repaired);
	if (!tokens.length) continue;

	console.log(`\n${chart.song.name}  (${chart.id})`);
	for (const t of rest) {
		console.log(`   ok?  [${t.token}] ×${t.count} — not a chord, left as is`);
	}
	for (const t of fixes) {
		console.log(`   fix  [${t.token}] ×${t.count}  →  [${t.repaired}]`);
	}
	unidentified += rest.length;

	if (!fixes.length) continue;
	const content = fixes.reduce(
		(text, t) => text.replaceAll(`[${t.token}]`, `[${t.repaired}]`),
		chart.content,
	);
	repaired += fixes.reduce((n, t) => n + t.count, 0);
	if (write) {
		await prisma.chart.update({ where: { id: chart.id }, data: { content } });
	}
}

console.log(
	`\n${write ? "Repaired" : "Would repair"} ${repaired} token(s) across ${charts.length} chart(s);` +
		` ${unidentified} non-chord token(s) left untouched.`,
);
if (!write && repaired) console.log("Re-run with --write to apply.");

await prisma.$disconnect();
