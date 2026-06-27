/**
 * Role & permission model for bands (Organizations). Three roles per PRD §9, mapped
 * onto better-auth's organization access control. See CLAUDE.md §D6.
 *
 *   Admin  — manage band + members + songs + playlists
 *   Writer — create/update/delete songs + build playlists (no member management)
 *   Reader — read / transpose / perform / offline / PDF only
 *
 * The same role strings are stored on `Member.role` and checked by the API write
 * guards (see requireWrite / requireAdmin in services).
 */

import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

export const statement = {
	...defaultStatements,
	song: ["read", "create", "update", "delete"],
	songbook: ["read", "create", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

export const reader = ac.newRole({
	song: ["read"],
	songbook: ["read"],
});

export const writer = ac.newRole({
	song: ["read", "create", "update", "delete"],
	songbook: ["read", "create", "update", "delete"],
});

export const admin = ac.newRole({
	...defaultStatements,
	song: ["read", "create", "update", "delete"],
	songbook: ["read", "create", "update", "delete"],
});

export const roles = { admin, writer, reader };

export type BandRole = keyof typeof roles;

/** Roles allowed to create/update/delete songs & playlists in a band. */
export const WRITE_ROLES: readonly string[] = ["admin", "writer"];
/** Roles allowed to manage the band, its members and invitations. */
export const ADMIN_ROLES: readonly string[] = ["admin"];

export function canWrite(role: string | null | undefined): boolean {
	return !!role && WRITE_ROLES.includes(role);
}

export function isAdmin(role: string | null | undefined): boolean {
	return !!role && ADMIN_ROLES.includes(role);
}
