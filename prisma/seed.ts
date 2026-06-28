/**
 * Seeds the Curated library — a small hand-picked set of public-domain songs so the
 * app isn't empty (PRD §11). Curated songs have organizationId = null (read-only to
 * everyone; forkable into any band/personal scope). Idempotent: skips existing slugs.
 *
 * Run: bun run db:seed
 */

import { prisma } from "../src/backend/prisma";
import { parseChordproMeta } from "../src/shared/chordpro";
import { slugify } from "../src/shared/slug";

type Seed = { name: string; artist: string; tags: string[]; content: string };

const SONGS: Seed[] = [
	{
		name: "House of the Rising Sun",
		artist: "Traditional",
		tags: ["folk", "slow"],
		content: `{title: House of the Rising Sun}
{artist: Traditional}
{key: Am}
{capo: 2}
{tempo: 76}
{time: 6/8}
{tags: folk, slow}
{start_of_verse: Verse 1}
[Am]There is a [C]house in [D]New Or[F]leans
They [Am]call the [C]Rising [E]Sun
[Am]And it's [C]been the [D]ruin of [F]many a poor [Am]boy
And [E]God, I know I'm [Am]one
{end_of_verse}`,
	},
	{
		name: "Scarborough Fair",
		artist: "Traditional",
		tags: ["folk"],
		content: `{title: Scarborough Fair}
{artist: Traditional}
{key: Em}
{tempo: 96}
{tags: folk}
{start_of_verse: Verse 1}
[Em]Are you going to [G]Scarborough [Em]Fair?
[Em]Parsley, [D]sage, rose[Em]mary and [G]thyme
Re[Em]member me [G]to one who [C]lives [B7]there
[Em]She once [D]was a true love of [Em]mine
{end_of_verse}`,
	},
	{
		name: "Wayfaring Stranger",
		artist: "Traditional",
		tags: ["gospel", "folk"],
		content: `{title: Wayfaring Stranger}
{artist: Traditional}
{key: Am}
{tempo: 72}
{tags: gospel, folk}
{start_of_verse: Verse 1}
I'm just a [Am]poor wayfaring [Dm]stranger
[Am]Traveling through this world of [E]woe
[Am]But there's no sickness, [Dm]toil or danger
In that [Am]bright land [E]to which I [Am]go
{end_of_verse}`,
	},
	{
		name: "Greensleeves",
		artist: "Traditional",
		tags: ["folk"],
		content: `{title: Greensleeves}
{artist: Traditional}
{key: Am}
{tempo: 90}
{time: 3/4}
{tags: folk}
{start_of_verse: Verse 1}
A[Am]las my [C]love you [G]do me [Em]wrong
To [Am]cast me [E]off dis[Am]courte[E]ously
{end_of_verse}`,
	},
	{
		name: "Amazing Grace",
		artist: "J. Newton",
		tags: ["gospel"],
		content: `{title: Amazing Grace}
{artist: J. Newton}
{key: G}
{tempo: 70}
{time: 3/4}
{tags: gospel}
{start_of_verse: Verse 1}
A[G]mazing [G7]grace how [C]sweet the [G]sound
That [G]saved a wretch like [D]me
I [G]once [G7]was lost but [C]now am [G]found
Was [Em]blind but [D]now I [G]see
{end_of_verse}`,
	},
	{
		name: "Shenandoah",
		artist: "Traditional",
		tags: ["folk"],
		content: `{title: Shenandoah}
{artist: Traditional}
{key: D}
{tempo: 66}
{tags: folk}
{start_of_verse: Verse 1}
Oh [D]Shenan[G]doah, I [D]long to [Bm]hear you
A[D]way you [G]rolling [A]river
{end_of_verse}`,
	},
	{
		name: "St. James Infirmary",
		artist: "Traditional",
		tags: ["blues"],
		content: `{title: St. James Infirmary}
{artist: Traditional}
{key: Dm}
{tempo: 80}
{tags: blues}
{start_of_verse: Verse 1}
I went [Dm]down to [A7]St. James In[Dm]firmary
I [Dm]saw my [Gm]baby [A7]there
{end_of_verse}`,
	},
];

async function tagId(name: string): Promise<string> {
	const slug = slugify(name);
	const found = await prisma.tag.findUnique({ where: { slug }, select: { id: true } });
	return found?.id ?? (await prisma.tag.create({ data: { name, slug } })).id;
}

async function artistId(name: string): Promise<string> {
	const slug = slugify(name);
	const found = await prisma.artist.findUnique({ where: { slug }, select: { id: true } });
	return found?.id ?? (await prisma.artist.create({ data: { name, slug } })).id;
}

async function main() {
	for (const s of SONGS) {
		const slug = slugify(s.name);
		if (await prisma.song.findUnique({ where: { slug }, select: { id: true } })) {
			console.log(`· skip ${s.name} (exists)`);
			continue;
		}
		const meta = parseChordproMeta(s.content);
		await prisma.song.create({
			data: {
				name: s.name,
				slug,
				organizationId: null, // Curated
				year: meta.year ?? null,
				charts: {
					create: {
						organizationId: null,
						content: s.content,
						key: meta.key,
						capo: meta.capo,
						tempo: meta.tempo,
						timeSignature: meta.timeSignature,
					},
				},
				credits: { create: { artistId: await artistId(s.artist), role: "ARTIST" } },
				tags: { create: await Promise.all(s.tags.map(async (t) => ({ tagId: await tagId(t) }))) },
			},
		});
		console.log(`+ seeded ${s.name}`);
	}
	console.log("Curated library ready.");
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
