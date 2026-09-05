import { auth } from "@frontend/auth";
import { unsubscribeDevice } from "@frontend/lib/push";
import { clearSessionHint } from "@frontend/lib/sessionHint";
import { clearSessionSnapshot } from "@frontend/lib/sessionSnapshot";
import { useCallback, useState } from "react";

/**
 * Signing out — which, in this app, means undoing four separate pieces of per-device
 * state, not one.
 *
 * The session cookie is httpOnly, so only the server can clear it: if that request fails,
 * the browser is still signed in and clearing anything locally would be a lie. Hence the
 * order below — the server first, everything else only once it has agreed.
 *
 * 1. **The push subscription** (§D21) is bound to an account, and the device keeps it
 *    across sign-outs unless told otherwise. Left behind, this laptop would go on buzzing
 *    for exports started by an account that has walked away from it. Best-effort: it must
 *    not be able to trap someone in a session it can't leave.
 * 2. **The server session.**
 * 3. **The offline session snapshot** (§D7). It is deliberately kept through network
 *    errors, so an explicit sign-out is one of the few answers that may clear it —
 *    otherwise the installed PWA would still boot into a signed-in shell.
 * 4. **The landing page's hint cookie** (§D22), so `/` goes back to offering Log in.
 *
 * Then a full page load rather than a client-side navigation: it drops the query cache,
 * the React contexts and anything else the previous account left in memory, which is the
 * one guarantee worth having when the next person to use this browser may not be you.
 */
export function useSignOut() {
	const [pending, setPending] = useState(false);
	const [failed, setFailed] = useState(false);

	const signOut = useCallback(async () => {
		setPending(true);
		setFailed(false);
		try {
			await unsubscribeDevice().catch(() => {
				// A dead push service must not be able to keep someone signed in.
			});
			const { error } = await auth.signOut();
			if (error) throw new Error(error.message ?? "Sign out failed.");
		} catch {
			// The cookie is still valid, so say so instead of pretending: clearing local
			// state here would show a signed-out UI that signs itself back in on reload.
			setPending(false);
			setFailed(true);
			return;
		}

		clearSessionSnapshot();
		clearSessionHint();
		// The marketing landing, which now knows to offer Log in again.
		window.location.href = "/";
	}, []);

	return { signOut, pending, failed };
}
