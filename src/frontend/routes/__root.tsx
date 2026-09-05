import { auth } from "@frontend/auth";
import { SessionProvider } from "@frontend/contexts/SessionContext";
import { UserProvider } from "@frontend/contexts/UserContext";
import { clearSessionHint, saveSessionHint } from "@frontend/lib/sessionHint";
import {
	clearSessionSnapshot,
	readSessionSnapshot,
	type SessionSnapshot,
	saveSessionSnapshot,
} from "@frontend/lib/sessionSnapshot";
import { useStore } from "@nanostores/react";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createRootRoute({
	notFoundComponent: () => <div>404 Not Found</div>,
	component: RootRoute,
});

function RootRoute() {
	const { data, error, isPending } = useStore(auth.useSession);
	// Read once, synchronously, so an offline boot never flashes a signed-out frame.
	const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(
		readSessionSnapshot,
	);

	// Keep the device's copy in step with the server's answer. A network error is not an
	// answer — only an explicit "no session" clears it (CLAUDE.md §D7, sessionSnapshot.ts).
	// The landing page's hint cookie (§D22) follows exactly the same rule: it is written
	// here because this is the one place that knows, authoritatively, whether there is a
	// session — and the landing itself ships no JavaScript that could find out.
	useEffect(() => {
		if (data?.session && data?.user) {
			const next = { session: data.session, user: data.user };
			saveSessionSnapshot(next);
			saveSessionHint(data.user.name);
			setSnapshot(next);
		} else if (!error && !isPending) {
			clearSessionSnapshot();
			clearSessionHint();
			setSnapshot(null);
		}
	}, [data, error, isPending]);

	if (isPending) {
		return <div>Loading...</div>;
	}

	// The session read failed (offline, or the server is down). Fall back to the snapshot
	// so the app still opens on its offline shelf; without one there is nothing to show.
	if (error && !snapshot) {
		return (
			<div className="grid min-h-dvh place-items-center bg-background px-6 text-center">
				<div>
					<h1 className="font-display text-xl font-bold text-foreground">
						You're offline
					</h1>
					<p className="mt-2 max-w-sm text-sm text-muted-foreground">
						BandBro couldn't reach the server, and this device has no signed-in
						session saved. Reconnect and reload to sign in.
					</p>
				</div>
			</div>
		);
	}

	const session = data?.session ?? (error ? snapshot?.session : null) ?? null;
	const user = data?.user ?? (error ? snapshot?.user : null) ?? null;

	return (
		<SessionProvider value={session}>
			<UserProvider value={user}>
				<Outlet />
			</UserProvider>
		</SessionProvider>
	);
}
