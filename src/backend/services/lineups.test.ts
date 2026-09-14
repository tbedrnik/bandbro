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
