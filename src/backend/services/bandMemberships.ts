import { prisma } from "@backend/prisma";

/**
 * The caller's own membership of each band, with the role they actually hold.
 *
 * better-auth's organization list carries the organizations but not the viewer's role in
 * them, so Preferences had nothing to render and printed a hardcoded "Admin" badge beside
 * every band — telling a Reader they were an admin (CLAUDE.md §D27).
 */
export async function bandMemberships({ userId }: { userId: string }) {
	const members = await prisma.member.findMany({
		where: { userId },
		select: {
			role: true,
			organization: { select: { id: true, name: true, metadata: true } },
		},
		orderBy: { createdAt: "asc" },
	});

	// `member` has no unique on (organizationId, userId), so a band can appear twice.
	// Keep the strongest role, which is the one that actually governs what happens.
	const rank = (role: string) =>
		role === "admin" || role === "owner" ? 2 : role === "writer" ? 1 : 0;
	const best = new Map<string, { id: string; name: string; role: string }>();
	for (const m of members) {
		const existing = best.get(m.organization.id);
		if (!existing || rank(m.role) > rank(existing.role)) {
			best.set(m.organization.id, {
				id: m.organization.id,
				name: m.organization.name,
				role: m.role,
			});
		}
	}
	return [...best.values()];
}
