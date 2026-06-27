import { canWrite, isAdmin } from "@backend/permissions";
import { prisma } from "@backend/prisma";

/** Thrown by guards; mapped to HTTP status by the route's error handling. */
export class HttpError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

/** Prisma `where` fragment matching every song/chart the user may read. */
export function readableScopeWhere(userId: string | undefined) {
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
	const base =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "song";
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
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
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
		const slug = name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");
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
