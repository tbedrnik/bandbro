import { canWrite, isAdmin } from "@backend/permissions";
import { prisma } from "@backend/prisma";
import { slugify } from "../../shared/slug";

/** Thrown by guards; mapped to HTTP status by the route's error handling. */
export class HttpError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

/**
 * Prisma `where` fragment matching every song/chart the user may read.
 *
 * With no user only Curated is readable. Spelling that out matters: written as one
 * `OR`, the membership arm becomes `members: {some: {userId: undefined}}` for an
 * anonymous caller, and Prisma reads an undefined filter as "no condition" — i.e. *any
 * org that has any member at all*, which is every band in the database.
 */
export function readableScopeWhere(
	userId: string | undefined,
): { organizationId: null } | { OR: object[] } {
	if (!userId) return { organizationId: null };
	return {
		OR: [
			{ organizationId: null }, // Curated / public
			{ organization: { members: { some: { userId } } } }, // bands + personal
		],
	};
}

export async function getMemberRole(
	userId: string,
	organizationId: string,
): Promise<string | null> {
	const member = await prisma.member.findFirst({
		where: { userId, organizationId },
		select: { role: true },
	});
	return member?.role ?? null;
}

/**
 * Ensure the user may write songs/playlists in `organizationId`. Curated scope
 * (null) is never writable. Returns the caller's role.
 */
export async function requireWrite(
	userId: string,
	organizationId: string | null,
): Promise<string> {
	if (!organizationId) {
		throw new HttpError(403, "The curated library is read-only.");
	}
	const role = await getMemberRole(userId, organizationId);
	if (!canWrite(role)) {
		throw new HttpError(403, "You need a writer or admin role in this band.");
	}
	return role as string;
}

/**
 * Ensure the user is a member of the organization — the read gate for band-scoped
 * resources (setlists, exports). Returns the caller's role.
 *
 * Membership-for-read used to be inlined as `organization: {members: {some: {userId}}}`
 * at each call site, which is fine until one of them forgets.
 */
export async function requireMember(
	userId: string,
	organizationId: string,
): Promise<string> {
	const role = await getMemberRole(userId, organizationId);
	if (!role) throw new HttpError(404, "Not found.");
	return role;
}

/**
 * Which of `charts` may NOT be referenced by a setlist owned by `organizationId`.
 * Pure, so the rule is testable without a database.
 *
 * A setlist entry is a *reference*, not a copy — so a chart owned by another band
 * would keep changing under this setlist whenever its owners edit it, and
 * `liveSessionPublicRead` would serve it to fans with no auth. Only two things are
 * safe to reference: the band's own charts, and Curated ones (`organizationId: null`),
 * which are read-only and so can never drift. Anything else must be forked in first.
 */
export function foreignChartIds(
	charts: { id: string; organizationId: string | null }[],
	organizationId: string,
): string[] {
	return charts
		.filter(
			(c) => c.organizationId !== null && c.organizationId !== organizationId,
		)
		.map((c) => c.id);
}

/** Throw unless every chart id exists and is usable in `organizationId`. */
export async function assertChartsUsableIn(
	chartIds: string[] | undefined,
	organizationId: string,
): Promise<void> {
	if (!chartIds?.length) return;
	const ids = [...new Set(chartIds)];
	const charts = await prisma.chart.findMany({
		where: { id: { in: ids } },
		select: { id: true, organizationId: true },
	});
	if (charts.length !== ids.length) {
		throw new HttpError(404, "Some of those songs no longer exist.");
	}
	if (foreignChartIds(charts, organizationId).length) {
		throw new HttpError(
			403,
			"That song belongs to another band — fork it into this one first.",
		);
	}
}

/** Ensure the user is an admin of the organization (manage members/band). */
export async function requireAdmin(
	userId: string,
	organizationId: string,
): Promise<string> {
	const role = await getMemberRole(userId, organizationId);
	if (!isAdmin(role)) {
		throw new HttpError(403, "You need an admin role in this band.");
	}
	return role as string;
}

/** Unique, URL-safe slug derived from `name`, suffixed on collision. */
export async function uniqueSongSlug(name: string): Promise<string> {
	const base = slugify(name).slice(0, 60) || "song";
	let slug = base;
	let n = 1;
	while (
		await prisma.song.findUnique({ where: { slug }, select: { id: true } })
	) {
		n += 1;
		slug = `${base}-${n}`;
	}
	return slug;
}

/** Find-or-create an Artist by name, returning its id. */
export async function findOrCreateArtist(name: string): Promise<string> {
	const slug = slugify(name);
	const existing = await prisma.artist.findUnique({
		where: { slug },
		select: { id: true },
	});
	if (existing) return existing.id;
	const created = await prisma.artist.create({ data: { name, slug } });
	return created.id;
}

/** Find-or-create Tags by name, returning their ids. */
export async function findOrCreateTags(names: string[]): Promise<string[]> {
	const ids: string[] = [];
	for (const name of names) {
		const slug = slugify(name);
		if (!slug) continue;
		const existing = await prisma.tag.findUnique({
			where: { slug },
			select: { id: true },
		});
		ids.push(
			existing?.id ?? (await prisma.tag.create({ data: { name, slug } })).id,
		);
	}
	return ids;
}
