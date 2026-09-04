import type { Auth } from "@frontend/auth";

/**
 * Last-known session/user, kept on the device so the installed app can boot with no
 * signal (CLAUDE.md §D7).
 *
 * **What this is:** a UI affordance. `better-auth`'s session read is a network call; with
 * the network off it fails, `_protected/layout` sees no session and bounces to /login —
 * a form that also cannot reach the server. The whole installed app was therefore
 * unusable offline, downloaded setlists included. The snapshot lets the app render its
 * chrome and its offline shelf from the name and ids it saw last.
 *
 * **What this is not:** authorization. It grants nothing. Every API route still goes
 * through the server's `auth`/`authOptional` macros and its role guards, so a snapshot
 * without a valid session cookie buys exactly the screens that need no server — the
 * offline shelf and Live mode reading a downloaded setlist. It is written only from a
 * real session response, and cleared the moment the server answers that there is no
 * session (sign-out, expiry, a revoked session), which is the only authority on the
 * question.
 */

const KEY = "bandbro:session";

export type SessionSnapshot = {
	session: Auth["Session"]["session"];
	user: Auth["Session"]["user"];
};

export function saveSessionSnapshot(snapshot: SessionSnapshot) {
	try {
		localStorage.setItem(KEY, JSON.stringify(redact(snapshot)));
	} catch {
		// Storage blocked — the app simply loses its offline boot.
	}
}

/** Drop the credential and the request fingerprint — see the note above. */
function redact(snapshot: SessionSnapshot): SessionSnapshot {
	return {
		...snapshot,
		session: { ...snapshot.session, token: "", ipAddress: "", userAgent: "" },
	};
}

export function readSessionSnapshot(): SessionSnapshot | null {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<SessionSnapshot>;
		return parsed?.session && parsed?.user ? (parsed as SessionSnapshot) : null;
	} catch {
		return null;
	}
}

export function clearSessionSnapshot() {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// ignore
	}
}
