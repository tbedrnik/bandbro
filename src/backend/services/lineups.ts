import { prisma } from "@backend/prisma";
import { HttpError, requireMember, requireWrite } from "./scope";

/**
 * Lineups — the performing identity that owns setlists (CLAUDE.md §D25).
 *
 * One band, one shared song library, several names to play under. Everything here is
 * band-scoped: permission is still the band's `Member.role`, so a lineup never needs a
 * role model of its own.
 */

/**
 * The default lineup's id is derived from the band's, rather than being a random cuid.
 *
 * That buys two things. `ensureDefaultLineup` becomes a single idempotent upsert with no
 * read-then-write race — two concurrent callers cannot create two defaults. And the
 * backfill migration computes the same ids in plain SQL (`'dflt-' || organization.id`),
 * so the migration and the running app can never disagree about which lineup is the
 * default one.
 */
const DEFAULT_PREFIX = "dflt-";

export function defaultLineupId(organizationId: string): string {
	return `${DEFAULT_PREFIX}${organizationId}`;
}

/**
 * Make sure a band has its default lineup, and that every band member plays in it.
 *
 * Created lazily rather than in a better-auth organization hook: a band can appear from
 * the org plugin, the seed script or a migration, and a lazy upsert on the read path
 * covers all three without a hook for each.
 */
export async function ensureDefaultLineup(organizationId: string) {
	const id = defaultLineupId(organizationId);
	const org = await prisma.organization.findUnique({
		where: { id: organizationId },
		select: { name: true, members: { select: { userId: true } } },
	});
	if (!org) throw new HttpError(404, "Band not found.");

	const lineup = await prisma.lineup.upsert({
		where: { id },
		update: {},
		create: { id, name: org.name, organizationId, isDefault: true },
	});

	// The default lineup means "everyone in the band", so it tracks membership. SQLite
	// has no `skipDuplicates`, so insert the delta rather than upserting the world.
	const present = new Set(
		(
			await prisma.lineupMember.findMany({
				where: { lineupId: id },
				select: { userId: true },
			})
		).map((m) => m.userId),
	);
	const missing = [...new Set(org.members.map((m) => m.userId))].filter(
		(userId) => !present.has(userId),
	);
	if (missing.length) {
		await prisma.lineupMember.createMany({
			data: missing.map((userId) => ({ lineupId: id, userId })),
		});
	}
	return lineup;
}

const lineupInclude = {
	members: { select: { userId: true, user: { select: { name: true } } } },
	_count: { select: { songbooks: true } },
} as const;

/**
 * Resolve a lineup and check the caller may write to its band. Every lineup-scoped
 * write goes through this, so the band's role model stays the single source of truth.
 */
export async function requireLineupWrite(userId: string, lineupId: string) {
	const select = {
		id: true,
		name: true,
		organizationId: true,
		isDefault: true,
	} as const;

	let lineup = await prisma.lineup.findUnique({
		where: { id: lineupId },
		select,
	});

	// A default lineup's id is derived from its band's, so callers can compute one for a
	// band whose row hasn't been materialised yet (the lazy creation above runs on the
	// read path). Deriving an id you then can't address would make the derivation a lie,
	// so materialise it here rather than 404.
	if (!lineup && lineupId.startsWith(DEFAULT_PREFIX)) {
		const organizationId = lineupId.slice(DEFAULT_PREFIX.length);
		if (await prisma.organization.count({ where: { id: organizationId } })) {
			await ensureDefaultLineup(organizationId);
			lineup = await prisma.lineup.findUnique({
				where: { id: lineupId },
				select,
			});
		}
	}
	if (!lineup) throw new HttpError(404, "Lineup not found.");
	const role = await requireWrite(userId, lineup.organizationId);
	return { lineup, role };
}

/** Lineups of one band, or of every band the caller belongs to. */
export async function lineupsList({
	userId,
	query = {},
}: {
	userId: string;
	query?: { organizationId?: string };
}) {
	if (query.organizationId) {
		await requireMember(userId, query.organizationId);
		await ensureDefaultLineup(query.organizationId);
		return prisma.lineup.findMany({
			where: { organizationId: query.organizationId },
			orderBy: [{ isDefault: "desc" }, { name: "asc" }],
			include: lineupInclude,
		});
	}

	// Across every band at once, rather than `ensureDefaultLineup` in a loop. Measured
	// for a user in four bands: 32 statements per request down to 5, for work that is a
	// no-op after the first ever call (CLAUDE.md §D27). Batching it is only possible
	// because a default lineup's id is *derived* from its band's, so the rows can be
	// looked up before any of them exist.
	//
	// (Five, not two, because Prisma issues a statement per included relation — the
	// point is that the count no longer grows with the number of bands.)
	const readable = { organization: { members: { some: { userId } } } };

	const [members, lineups] = await Promise.all([
		prisma.member.findMany({
			where: readable,
			select: {
				organizationId: true,
				userId: true,
				organization: { select: { name: true } },
			},
		}),
		prisma.lineup.findMany({
			where: readable,
			orderBy: [{ isDefault: "desc" }, { name: "asc" }],
			include: lineupInclude,
		}),
	]);

	const bands = new Map<string, Set<string>>();
	for (const m of members) {
		const band = bands.get(m.organizationId) ?? new Set<string>();
		band.add(m.userId);
		bands.set(m.organizationId, band);
	}
	const defaults = new Map(
		lineups.filter((l) => l.isDefault).map((l) => [l.id, l]),
	);

	// Reconcile, and only then. A band with no default lineup yet, or one that hasn't
	// caught up with somebody who joined since, are both rare — so the writes, and the
	// re-read they force, happen only when there is something to do. The steady state
	// is the two reads above.
	let changed = false;
	for (const [organizationId, userIds] of bands) {
		const lineup = defaults.get(defaultLineupId(organizationId));
		if (!lineup) {
			await ensureDefaultLineup(organizationId);
			changed = true;
			continue;
		}
		const present = new Set(lineup.members.map((m) => m.userId));
		const missing = [...userIds].filter((id) => !present.has(id));
		if (missing.length) {
			await prisma.lineupMember.createMany({
				data: missing.map((id) => ({ lineupId: lineup.id, userId: id })),
			});
			changed = true;
		}
	}
	if (!changed) return lineups;

	return prisma.lineup.findMany({
		where: readable,
		orderBy: [{ isDefault: "desc" }, { name: "asc" }],
		include: lineupInclude,
	});
}

export async function lineupsCreate({
	userId,
	payload,
}: {
	userId: string;
	payload: { name: string; organizationId: string; memberIds?: string[] };
}) {
	await requireWrite(userId, payload.organizationId);
	// A second lineup is the moment the concept becomes visible, so the band must
	// already have its default one to sit beside.
	await ensureDefaultLineup(payload.organizationId);

	const memberIds = await validMemberIds(
		payload.organizationId,
		payload.memberIds,
	);
	return prisma.lineup.create({
		data: {
			name: payload.name,
			organizationId: payload.organizationId,
			members: { create: memberIds.map((id) => ({ userId: id })) },
		},
		include: lineupInclude,
	});
}

export async function lineupsUpdate({
	id,
	userId,
	payload,
}: {
	id: string;
	userId: string;
	payload: { name?: string; memberIds?: string[] };
}) {
	const { lineup } = await requireLineupWrite(userId, id);

	if (payload.memberIds) {
		const memberIds = await validMemberIds(
			lineup.organizationId,
			payload.memberIds,
		);
		// `validMemberIds` already de-duplicates, and the rows are replaced wholesale,
		// so there is nothing left for a `skipDuplicates` to skip (SQLite has none).
		await prisma.lineupMember.deleteMany({ where: { lineupId: id } });
		if (memberIds.length) {
			await prisma.lineupMember.createMany({
				data: memberIds.map((userId) => ({ lineupId: id, userId })),
			});
		}
	}

	return prisma.lineup.update({
		where: { id },
		data: { name: payload.name ?? undefined },
		include: lineupInclude,
	});
}

export async function lineupsDelete({
	id,
	userId,
}: {
	id: string;
	userId: string;
}) {
	const { lineup } = await requireLineupWrite(userId, id);
	if (lineup.isDefault) {
		throw new HttpError(
			400,
			"A band's main lineup can't be deleted — rename it instead.",
		);
	}
	// The FK cascades, which would take the setlists with it. Refuse instead and say
	// how many: losing a gig's songbook to a tidy-up is not recoverable.
	const songbooks = await prisma.songbook.count({ where: { lineupId: id } });
	if (songbooks > 0) {
		throw new HttpError(
			409,
			`That lineup still has ${songbooks} setlist${songbooks === 1 ? "" : "s"} — move or delete ${songbooks === 1 ? "it" : "them"} first.`,
		);
	}
	await prisma.lineup.delete({ where: { id } });
	return { id, deleted: true };
}

/** Keep a lineup's players inside its own band; silently drop anyone who isn't. */
async function validMemberIds(
	organizationId: string,
	userIds: string[] | undefined,
): Promise<string[]> {
	if (!userIds?.length) return [];
	const members = await prisma.member.findMany({
		where: { organizationId, userId: { in: [...new Set(userIds)] } },
		select: { userId: true },
	});
	return [...new Set(members.map((m) => m.userId))];
}
