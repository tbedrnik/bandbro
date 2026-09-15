import { Database } from "bun:sqlite";
import { beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

// The services talk to a real database: the clone semantics are a property of which
// rows point where, which a mock cannot show. `prisma.ts` reads DATABASE_URL when it is
// first imported, so the temp database has to exist and be named before any backend
// module is pulled in — hence the dynamic imports.
// test/setup.ts (preloaded) has already pointed DATABASE_URL at a throwaway file, which
// is what lets this run in any order relative to the other backend tests. Build the
// schema in it before importing anything that talks to it.
const dbPath = (process.env.DATABASE_URL ?? "").replace(/^file:/, "");
if (!dbPath) throw new Error("test/setup.ts should have set DATABASE_URL");

const schema = new Database(dbPath);
for (const d of readdirSync("prisma/migrations")
	.filter((f) => f.startsWith("2026"))
	.sort()) {
	schema.exec(readFileSync(`prisma/migrations/${d}/migration.sql`, "utf8"));
}
schema.close();

const { prisma } = await import("@backend/prisma");
const { songbooksClone } = await import("./songbooksClone");
const { songbooksCreate } = await import("./songbooksCreate");
const { songbooksList } = await import("./songbooksList");
const { songbooksUpdate } = await import("./songbooksUpdate");
const { defaultLineupId, ensureDefaultLineup, lineupsCreate, lineupsDelete } =
	await import("./lineups");
const { forkChartInto } = await import("./forkChart");
const { songsUpdate } = await import("./songsUpdate");
const { requireWrite, requireMember, requireAdmin, readableScopeWhere } =
	await import("./scope");
const { lineupReadinessFor, proficiencySet } = await import("./proficiency");
const { songsList } = await import("./songsList");
const { foreignChartIds } = await import("./scope");

describe("foreignChartIds", () => {
	const ORG = "o_banda";

	test("the band's own charts are referenceable", () => {
		expect(foreignChartIds([{ id: "c1", organizationId: ORG }], ORG)).toEqual(
			[],
		);
	});

	test("curated charts are referenceable — read-only, so they cannot drift", () => {
		expect(foreignChartIds([{ id: "c1", organizationId: null }], ORG)).toEqual(
			[],
		);
	});

	test("another band's chart is not — it would keep changing under this setlist", () => {
		expect(
			foreignChartIds([{ id: "c1", organizationId: "o_other" }], ORG),
		).toEqual(["c1"]);
	});

	test("reports every offender, not just the first", () => {
		expect(
			foreignChartIds(
				[
					{ id: "mine", organizationId: ORG },
					{ id: "theirs", organizationId: "o_other" },
					{ id: "curated", organizationId: null },
					{ id: "theirs2", organizationId: "o_third" },
				],
				ORG,
			),
		).toEqual(["theirs", "theirs2"]);
	});
});

const ids = {
	tomas: "u_tomas",
	dave: "u_dave",
	stranger: "u_stranger",
	banda: "o_banda",
	other: "o_other",
} as const;

let duoLineupId: string;
let sourceSetlistId: string;
let bandaChartId: string;
let curatedChartId: string;

beforeAll(async () => {
	const now = new Date();
	for (const [id, name] of [
		[ids.tomas, "Tomas"],
		[ids.dave, "Dave"],
		[ids.stranger, "Stranger"],
	])
		await prisma.user.create({
			data: { id, name, email: `${id}@x.cz`, createdAt: now, updatedAt: now },
		});

	for (const [id, name] of [
		[ids.banda, "Banda"],
		[ids.other, "Other Band"],
	])
		await prisma.organization.create({
			data: { id, name, slug: id, createdAt: now },
		});

	for (const [org, user, role] of [
		[ids.banda, ids.tomas, "admin"],
		[ids.banda, ids.dave, "writer"],
		[ids.other, ids.tomas, "admin"],
		[ids.other, ids.stranger, "admin"],
	])
		await prisma.member.create({
			data: {
				id: `${org}-${user}`,
				organizationId: org,
				userId: user,
				role,
				createdAt: now,
			},
		});

	// One song in Banda's library, one in the Curated library.
	const bandaSong = await prisma.song.create({
		data: {
			name: "Wagon Wheel",
			slug: "wagon-wheel",
			organizationId: ids.banda,
			charts: {
				create: { content: "[G]Heading down south", organizationId: ids.banda },
			},
		},
		include: { charts: true },
	});
	bandaChartId = bandaSong.charts[0]!.id;

	const curatedSong = await prisma.song.create({
		data: {
			name: "House of the Rising Sun",
			slug: "house-of-the-rising-sun",
			charts: { create: { content: "[Am]There is a house" } },
		},
		include: { charts: true },
	});
	curatedChartId = curatedSong.charts[0]!.id;

	await ensureDefaultLineup(ids.banda);
	await ensureDefaultLineup(ids.other);

	const duo = await lineupsCreate({
		userId: ids.tomas,
		payload: {
			name: "Duo Tomi Kohy",
			organizationId: ids.banda,
			memberIds: [ids.tomas],
		},
	});
	duoLineupId = duo.id;

	const set = await songbooksCreate({
		userId: ids.tomas,
		payload: {
			title: "Friday @ The Anchor",
			lineupId: defaultLineupId(ids.banda),
			chartIds: [bandaChartId, curatedChartId],
		},
	});
	sourceSetlistId = set.id;
});

describe("ensureDefaultLineup", () => {
	test("is idempotent — the derived id means no second default can appear", async () => {
		await ensureDefaultLineup(ids.banda);
		await ensureDefaultLineup(ids.banda);
		const defaults = await prisma.lineup.findMany({
			where: { organizationId: ids.banda, isDefault: true },
		});
		expect(defaults).toHaveLength(1);
		expect(defaults[0]!.id).toBe(defaultLineupId(ids.banda));
	});

	test("the default lineup holds every band member", async () => {
		const members = await prisma.lineupMember.findMany({
			where: { lineupId: defaultLineupId(ids.banda) },
		});
		expect(members.map((m) => m.userId).sort()).toEqual(
			[ids.dave, ids.tomas].sort(),
		);
	});
});

describe("songbooksCreate", () => {
	test("derives the band from the lineup, so the guard column can't drift", async () => {
		const set = await prisma.songbook.findUniqueOrThrow({
			where: { id: sourceSetlistId },
		});
		expect(set.organizationId).toBe(ids.banda);
		expect(set.lineupId).toBe(defaultLineupId(ids.banda));
	});

	test("refuses a chart belonging to another band", async () => {
		const theirs = await prisma.song.create({
			data: {
				name: "Their Song",
				slug: "their-song",
				organizationId: ids.other,
				charts: { create: { content: "[C]theirs", organizationId: ids.other } },
			},
			include: { charts: true },
		});
		await expect(
			songbooksCreate({
				userId: ids.tomas,
				payload: {
					title: "Nope",
					lineupId: defaultLineupId(ids.banda),
					chartIds: [theirs.charts[0]!.id],
				},
			}),
		).rejects.toThrow(/another band/i);
	});

	test("a writer without a role in the band is refused", async () => {
		await expect(
			songbooksCreate({
				userId: ids.stranger,
				payload: { title: "Nope", lineupId: defaultLineupId(ids.banda) },
			}),
		).rejects.toThrow();
	});
});

describe("songbooksClone", () => {
	test("within a band it copies rows only — both sets share the charts", async () => {
		const clone = await songbooksClone({
			id: sourceSetlistId,
			userId: ids.tomas,
			payload: { targetLineupId: duoLineupId },
		});

		expect(clone.lineupId).toBe(duoLineupId);
		expect(clone.organizationId).toBe(ids.banda);
		expect(clone.title).toBe("Friday @ The Anchor (copy)");

		const entries = await prisma.songbookSong.findMany({
			where: { songbookId: clone.id },
			orderBy: { order: "asc" },
		});
		expect(entries.map((e) => e.chartId)).toEqual([
			bandaChartId,
			curatedChartId,
		]);

		// The point of one shared library: fixing a typo fixes it in both sets.
		await prisma.chart.update({
			where: { id: bandaChartId },
			data: { content: "[G]Headin' down south" },
		});
		const viaClone = await prisma.chart.findUniqueOrThrow({
			where: { id: entries[0]!.chartId },
		});
		expect(viaClone.content).toBe("[G]Headin' down south");
	});

	test("across bands it forks the charts, so neither can edit the other's", async () => {
		const clone = await songbooksClone({
			id: sourceSetlistId,
			userId: ids.tomas,
			payload: {
				targetLineupId: defaultLineupId(ids.other),
				title: "Borrowed",
			},
		});
		expect(clone.organizationId).toBe(ids.other);
		expect(clone.title).toBe("Borrowed");

		const entries = await prisma.songbookSong.findMany({
			where: { songbookId: clone.id },
			orderBy: { order: "asc" },
		});
		const cloned = await prisma.chart.findUniqueOrThrow({
			where: { id: entries[0]!.chartId },
		});

		expect(cloned.id).not.toBe(bandaChartId);
		expect(cloned.organizationId).toBe(ids.other);
		expect(cloned.forkedFromId).toBe(bandaChartId);
		// Content came across…
		expect(cloned.content).toBe("[G]Headin' down south");
		// …but the two are now independent.
		await prisma.chart.update({
			where: { id: cloned.id },
			data: { content: "[A]Different now" },
		});
		const original = await prisma.chart.findUniqueOrThrow({
			where: { id: bandaChartId },
		});
		expect(original.content).toBe("[G]Headin' down south");
	});

	test("a curated chart is referenced even across bands — it can't drift", async () => {
		const clone = await songbooksClone({
			id: sourceSetlistId,
			userId: ids.tomas,
			payload: { targetLineupId: defaultLineupId(ids.other) },
		});
		const entries = await prisma.songbookSong.findMany({
			where: { songbookId: clone.id },
			orderBy: { order: "asc" },
		});
		expect(entries[1]!.chartId).toBe(curatedChartId);
	});

	test("someone with no role in the source band cannot clone out of it", async () => {
		await expect(
			songbooksClone({
				id: sourceSetlistId,
				userId: ids.stranger,
				payload: { targetLineupId: defaultLineupId(ids.other) },
			}),
		).rejects.toThrow();
	});
});

describe("songbooksUpdate", () => {
	test("refuses to move a set to a lineup in another band", async () => {
		await expect(
			songbooksUpdate({
				id: sourceSetlistId,
				userId: ids.tomas,
				payload: { lineupId: defaultLineupId(ids.other) },
			}),
		).rejects.toThrow(/another band/i);
	});

	test("renaming a setlist works", async () => {
		const updated = await songbooksUpdate({
			id: sourceSetlistId,
			userId: ids.tomas,
			payload: { title: "Saturday @ The Anchor" },
		});
		expect(updated.title).toBe("Saturday @ The Anchor");
	});
});

describe("songbooksList", () => {
	test("a scope param cannot reach a band you don't belong to", async () => {
		const leaked = await songbooksList({
			userId: ids.dave, // in Banda only
			query: { scope: ids.other },
		});
		expect(leaked).toEqual([]);
	});

	test("without a scope you see your own bands' setlists", async () => {
		const mine = await songbooksList({ userId: ids.dave });
		expect(mine.length).toBeGreaterThan(0);
		expect(mine.every((s) => s.organizationId === ids.banda)).toBe(true);
	});
});

describe("lineupsDelete", () => {
	test("a band's main lineup cannot be deleted", async () => {
		await expect(
			lineupsDelete({ id: defaultLineupId(ids.banda), userId: ids.tomas }),
		).rejects.toThrow(/main lineup/i);
	});

	test("a lineup still holding setlists is refused, not silently cascaded", async () => {
		await expect(
			lineupsDelete({ id: duoLineupId, userId: ids.tomas }),
		).rejects.toThrow(/setlist/i);
	});

	test("an empty lineup deletes", async () => {
		const spare = await lineupsCreate({
			userId: ids.tomas,
			payload: { name: "Spare", organizationId: ids.banda },
		});
		expect(await lineupsDelete({ id: spare.id, userId: ids.tomas })).toEqual({
			id: spare.id,
			deleted: true,
		});
	});
});

// ---------------------------------------------------------------------------
// Proficiency (§D26). The fixture is exactly the case this is for: Banda is Tomas +
// Dave, and "Duo Tomi Kohy" is Tomas alone — so the same song is ready for one lineup
// and not the other, from one shared library.
// ---------------------------------------------------------------------------

describe("proficiency", () => {
	test("a mark is per player and needs no write role — a Reader can set one", async () => {
		const reader = await prisma.user.create({
			data: {
				id: "u_reader",
				name: "Reader",
				email: "reader@x.cz",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		await prisma.member.create({
			data: {
				id: "m_reader",
				organizationId: ids.banda,
				userId: reader.id,
				role: "reader",
				createdAt: new Date(),
			},
		});
		expect(
			await proficiencySet({
				userId: reader.id,
				slug: "wagon-wheel",
				level: "FOLLOW",
			}),
		).toMatchObject({ level: "FOLLOW" });
	});

	test("UNKNOWN is stored as the absence of a row, not a row saying UNKNOWN", async () => {
		await proficiencySet({
			userId: ids.dave,
			slug: "wagon-wheel",
			level: "PLAY",
		});
		const song = await prisma.song.findUniqueOrThrow({
			where: { slug: "wagon-wheel" },
			select: { id: true },
		});
		expect(
			await prisma.songProficiency.count({
				where: { userId: ids.dave, songId: song.id },
			}),
		).toBe(1);

		await proficiencySet({
			userId: ids.dave,
			slug: "wagon-wheel",
			level: "UNKNOWN",
		});
		expect(
			await prisma.songProficiency.count({
				where: { userId: ids.dave, songId: song.id },
			}),
		).toBe(0);
	});

	test("a song nobody can read cannot be marked", async () => {
		await expect(
			proficiencySet({
				userId: ids.stranger,
				slug: "wagon-wheel",
				level: "PLAY",
			}),
		).rejects.toThrow(/not found/i);
	});

	test("the same song is ready for one lineup and not another", async () => {
		const song = await prisma.song.findUniqueOrThrow({
			where: { slug: "wagon-wheel" },
			select: { id: true },
		});
		// Tomas can play it; Dave has not said.
		await proficiencySet({
			userId: ids.tomas,
			slug: "wagon-wheel",
			level: "PLAY",
		});
		await proficiencySet({
			userId: ids.dave,
			slug: "wagon-wheel",
			level: "UNKNOWN",
		});

		// The duo is Tomas alone, so it is simply ready.
		const duo = await lineupReadinessFor(duoLineupId, [song.id]);
		expect(duo.get(song.id)).toEqual({
			level: "PLAY",
			unknown: 0,
			total: 1,
		});

		// The full band is not — and says why, rather than just scoring lower.
		const banda = await lineupReadinessFor(defaultLineupId(ids.banda), [
			song.id,
		]);
		const readiness = banda.get(song.id);
		expect(readiness?.level).toBe("PLAY");
		expect(readiness?.unknown).toBeGreaterThan(0);
	});

	test("players with no row still count — the denominator is the lineup", async () => {
		const curated = await prisma.song.findUniqueOrThrow({
			where: { slug: "house-of-the-rising-sun" },
			select: { id: true },
		});
		const banda = await lineupReadinessFor(defaultLineupId(ids.banda), [
			curated.id,
		]);
		const readiness = banda.get(curated.id);
		expect(readiness?.level).toBe("UNKNOWN");
		expect(readiness?.unknown).toBe(readiness?.total);
		expect(readiness?.total).toBeGreaterThan(0);
	});

	test("songsList carries my own mark, and readiness only when asked for a lineup", async () => {
		const plain = await songsList({
			user: { id: ids.tomas } as never,
			query: { q: "Wagon" },
		});
		expect(plain[0]?.myLevel).toBe("PLAY");
		expect(plain[0]?.readiness).toBeNull();

		const forDuo = await songsList({
			user: { id: ids.tomas } as never,
			query: { q: "Wagon", lineupId: duoLineupId },
		});
		expect(forDuo[0]?.readiness).toEqual({
			level: "PLAY",
			unknown: 0,
			total: 1,
		});
	});
});

describe("requireLineupWrite", () => {
	test("a derived default-lineup id is addressable before its row exists", async () => {
		// Deriving an id the caller then can't use would make the derivation a lie: the
		// row is created lazily on the read path, and a clone may name it first.
		const fresh = await prisma.organization.create({
			data: {
				id: "o_fresh",
				name: "Fresh Band",
				slug: "o_fresh",
				createdAt: new Date(),
			},
		});
		await prisma.member.create({
			data: {
				id: "m_fresh",
				organizationId: fresh.id,
				userId: ids.tomas,
				role: "admin",
				createdAt: new Date(),
			},
		});
		expect(
			await prisma.lineup.count({ where: { organizationId: fresh.id } }),
		).toBe(0);

		const clone = await songbooksClone({
			id: sourceSetlistId,
			userId: ids.tomas,
			payload: { targetLineupId: defaultLineupId(fresh.id) },
		});
		expect(clone.organizationId).toBe(fresh.id);
		expect(clone.lineupId).toBe(defaultLineupId(fresh.id));
	});

	test("an id that isn't a real lineup is still a 404", async () => {
		await expect(
			songbooksClone({
				id: sourceSetlistId,
				userId: ids.tomas,
				payload: { targetLineupId: "dflt-no-such-band" },
			}),
		).rejects.toThrow(/not found/i);
	});
});

// ---------------------------------------------------------------------------
// The legacy-data hazard the repair tool exists for (§D25). Setlists saved before
// `assertChartsUsableIn` could reference another band's chart; the guard then refuses
// every write to that set, because add/remove/reorder all PUT the *whole* chart-id array.
// ---------------------------------------------------------------------------

describe("a setlist holding another band's chart", () => {
	let strandedSetlistId: string;
	let foreignChartId: string;
	let ownChartId: string;

	beforeAll(async () => {
		const theirs = await prisma.song.create({
			data: {
				name: "Hallelujah",
				slug: "hallelujah",
				organizationId: ids.other,
				charts: {
					create: {
						content: "[C]I heard there was",
						organizationId: ids.other,
					},
				},
			},
			include: { charts: true },
		});
		foreignChartId = theirs.charts[0]!.id;

		const mine = await prisma.song.create({
			data: {
				name: "Country Roads",
				slug: "country-roads",
				organizationId: ids.banda,
				charts: {
					create: { content: "[A]Almost heaven", organizationId: ids.banda },
				},
			},
			include: { charts: true },
		});
		ownChartId = mine.charts[0]!.id;

		// Written straight to the database, the way a pre-guard save would have left it.
		const stranded = await prisma.songbook.create({
			data: {
				title: "Stranded set",
				lineupId: defaultLineupId(ids.banda),
				organizationId: ids.banda,
				songs: {
					create: [
						{ chartId: ownChartId, order: 0 },
						{ chartId: foreignChartId, order: 1 },
					],
				},
			},
		});
		strandedSetlistId = stranded.id;
	});

	test("reordering it is refused — the offending id rides along in the array", async () => {
		await expect(
			songbooksUpdate({
				id: strandedSetlistId,
				userId: ids.tomas,
				payload: { chartIds: [foreignChartId, ownChartId] },
			}),
		).rejects.toThrow(/another band/i);
	});

	test("even removing an unrelated song is refused", async () => {
		// The client rebuilds the array from the set's current contents, so a write that
		// has nothing to do with the foreign chart still carries it.
		await expect(
			songbooksUpdate({
				id: strandedSetlistId,
				userId: ids.tomas,
				payload: { chartIds: [foreignChartId] },
			}),
		).rejects.toThrow(/another band/i);
	});

	test("renaming it still works — no chartIds, so nothing to validate", async () => {
		const renamed = await songbooksUpdate({
			id: strandedSetlistId,
			userId: ids.tomas,
			payload: { title: "Stranded set (still editable)" },
		});
		expect(renamed.title).toBe("Stranded set (still editable)");
	});

	test("repointing the row at a fork makes the set editable again", async () => {
		// What `repair:setlists` does: fork the foreign chart into this band, then swap the
		// row over. The PK is (songbookId, chartId), so that is a delete + create.
		const replacement = await forkChartInto(foreignChartId, ids.banda);
		await prisma.songbookSong.delete({
			where: {
				songbookId_chartId: {
					songbookId: strandedSetlistId,
					chartId: foreignChartId,
				},
			},
		});
		await prisma.songbookSong.create({
			data: { songbookId: strandedSetlistId, chartId: replacement, order: 1 },
		});

		const reordered = await songbooksUpdate({
			id: strandedSetlistId,
			userId: ids.tomas,
			payload: { chartIds: [replacement, ownChartId] },
		});
		expect(reordered.songs.map((s) => s.chartId)).toEqual([
			replacement,
			ownChartId,
		]);

		// And the other band's original is untouched by any of it.
		const original = await prisma.chart.findUniqueOrThrow({
			where: { id: foreignChartId },
		});
		expect(original.content).toBe("[C]I heard there was");
		expect(original.organizationId).toBe(ids.other);
	});
});

// ---------------------------------------------------------------------------
// The security boundary. `scope.ts` guards every write in the app and had no tests.
// ---------------------------------------------------------------------------

describe("scope guards", () => {
	test("requireWrite: a writer may write, a reader may not", async () => {
		expect(await requireWrite(ids.tomas, ids.banda)).toBe("admin");
		expect(await requireWrite(ids.dave, ids.banda)).toBe("writer");
		await expect(requireWrite("u_reader", ids.banda)).rejects.toThrow(
			/writer or admin/i,
		);
	});

	test("requireWrite: a non-member is refused", async () => {
		await expect(requireWrite(ids.stranger, ids.banda)).rejects.toThrow();
	});

	test("requireWrite: the curated library is never writable", async () => {
		await expect(requireWrite(ids.tomas, null)).rejects.toThrow(/read-only/i);
	});

	test("requireAdmin: writers are not admins", async () => {
		expect(await requireAdmin(ids.tomas, ids.banda)).toBe("admin");
		await expect(requireAdmin(ids.dave, ids.banda)).rejects.toThrow(/admin/i);
	});

	test("requireMember: membership is the read floor", async () => {
		expect(await requireMember(ids.dave, ids.banda)).toBe("writer");
		await expect(requireMember(ids.stranger, ids.banda)).rejects.toThrow();
	});

	test("readableScopeWhere: an anonymous caller sees curated and nothing else", () => {
		// Written as one OR, the membership arm degenerates to "any org with any member"
		// for an anonymous caller, because Prisma reads an undefined filter as no filter.
		expect(readableScopeWhere(undefined)).toEqual({ organizationId: null });
		expect(readableScopeWhere("u_x")).toHaveProperty("OR");
	});
});

describe("songsUpdate chart ownership", () => {
	test("a chart id from another song is refused, not written", async () => {
		const mine = await prisma.song.create({
			data: {
				name: "My Song",
				slug: "my-song",
				organizationId: ids.banda,
				charts: { create: { content: "[C]mine", organizationId: ids.banda } },
			},
			include: { charts: true },
		});
		const curated = await prisma.song.findUniqueOrThrow({
			where: { slug: "house-of-the-rising-sun" },
			include: { charts: true },
		});
		const curatedChartId = curated.charts[0]!.id;

		// The exploit: every user is admin of their own personal band, and GET /songs
		// hands out every curated chart id — so `requireWrite` on *my* song passed while
		// the write landed on a chart in a scope nobody may write.
		await expect(
			songsUpdate({
				slug: "my-song",
				userId: ids.tomas,
				payload: {
					chart: { id: curatedChartId, content: "[X]vandalised" },
				},
			}),
		).rejects.toThrow(/isn't part of this song/i);

		const after = await prisma.chart.findUniqueOrThrow({
			where: { id: curatedChartId },
		});
		expect(after.content).toBe("[Am]There is a house");
		expect(after.organizationId).toBeNull();

		// And my own chart still updates normally.
		await songsUpdate({
			slug: "my-song",
			userId: ids.tomas,
			payload: { chart: { id: mine.charts[0]!.id, content: "[D]mine now" } },
		});
		const ok = await prisma.chart.findUniqueOrThrow({
			where: { id: mine.charts[0]!.id },
		});
		expect(ok.content).toBe("[D]mine now");
	});

	test("metadata in the ChordPro is denormalized on update, not dropped", async () => {
		// The editor sends neither `credits` nor `year`, so before this these directives
		// were parsed and then silently lost on every edit after creation (§D4).
		const updated = await songsUpdate({
			slug: "my-song",
			userId: ids.tomas,
			payload: {
				chart: {
					content:
						"{artist: Bob Dylan}\n{year: 1975}\n{key: G}\n{tempo: 120}\n{tags: folk}\n[G]words",
				},
			},
		});
		expect(updated.year).toBe(1975);
		expect(updated.tags.map((t) => t.tag.name)).toEqual(["folk"]);
		expect(updated.charts[0]?.key).toBe("G");
		expect(updated.charts[0]?.tempo).toBe(120);

		const credits = await prisma.credit.findMany({
			where: { songId: updated.id },
			include: { artist: true },
		});
		expect(credits.map((c) => c.artist.name)).toEqual(["Bob Dylan"]);
	});
});
