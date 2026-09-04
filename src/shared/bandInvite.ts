/**
 * Band invite links (CLAUDE.md §D13). This deployment can't send email, so a band is joined
 * by following an unguessable code — scanned off an admin's QR in the rehearsal room, or
 * pasted into any chat. The rules a link is judged by live here, pure and isomorphic, so the
 * redeem guard on the server and the "expired / used up" labels in the band page agree.
 */

/**
 * Unambiguous alphabet (no 0/O/1/I) — a code is read off a screen and typed by hand, and it
 * round-trips through a lowercased URL. Ten characters ≈ 50 bits: an invite link is a bearer
 * credential to a band's songbook, unlike the 5-character stage code (liveSessions.ts), which
 * only unlocks a read-only view of one gig.
 */
export const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 10;

export function randomInviteCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(INVITE_CODE_LENGTH));
	let code = "";
	for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
		code += INVITE_CODE_ALPHABET[bytes[i] % INVITE_CODE_ALPHABET.length];
	}
	return code;
}

/** Fold a pasted URL fragment or hand-typed code to the stored form. */
export function normalizeInviteCode(input: string): string {
	return input
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "")
		.slice(0, INVITE_CODE_LENGTH);
}

export function isInviteCodeFormat(code: string): boolean {
	if (code.length !== INVITE_CODE_LENGTH) return false;
	return [...code].every((ch) => INVITE_CODE_ALPHABET.includes(ch));
}

export type InviteState = {
	expiresAt: Date | string | null;
	revokedAt: Date | string | null;
	maxUses: number | null;
	useCount: number;
};

export type InviteStatus = "active" | "revoked" | "expired" | "exhausted";

/**
 * Why a link no longer works, in the order the admin should hear it: an explicitly revoked
 * link stays revoked even after it would have expired anyway.
 */
export function inviteStatus(
	invite: InviteState,
	now: Date = new Date(),
): InviteStatus {
	if (invite.revokedAt) return "revoked";
	if (
		invite.expiresAt &&
		new Date(invite.expiresAt).getTime() <= now.getTime()
	) {
		return "expired";
	}
	if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
		return "exhausted";
	}
	return "active";
}

/** Joins still available, or null when the link is unlimited. */
export function invitesLeft(invite: InviteState): number | null {
	if (invite.maxUses === null) return null;
	return Math.max(invite.maxUses - invite.useCount, 0);
}
