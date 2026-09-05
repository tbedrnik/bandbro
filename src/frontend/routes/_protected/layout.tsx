import { AppNav } from "@frontend/components/AppNav";
import { SiteFooter } from "@frontend/components/SiteFooter";
import { useSession } from "@frontend/contexts/SessionContext";
import { useOnline } from "@frontend/lib/offline";
import { syncPushSubscription, usePushMessages } from "@frontend/lib/push";
import { useTheme } from "@frontend/lib/theme";
import {
	createFileRoute,
	Navigate,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";

const SECTIONS: Record<string, string> = {
	"/library": "Library",
	"/setlists": "Setlists",
	"/bands": "Bands",
	"/preferences": "Preferences",
	"/songs": "Library",
};

export const Route = createFileRoute("/_protected")({
	component: ProtectedLayout,
});

function ProtectedLayout() {
	const session = useSession({ optional: true });
	// Ensure the persisted theme is applied across the authed app.
	useTheme();
	const online = useOnline();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	// Push (§D21): let the worker refresh this tab and route notification taps, and
	// re-register the device's subscription in case its endpoint rotated while away.
	usePushMessages();
	const signedIn = Boolean(session);
	useEffect(() => {
		if (signedIn) void syncPushSubscription();
	}, [signedIn]);

	// Where to come back to after signing in. Held in a ref and refreshed only while
	// there *is* a session, because this component renders once more after the redirect
	// below has started — by then `pathname` is already "/login", and re-navigating with
	// it overwrote the parameter with the login page's own path. Every bounced
	// destination arrived at the login screen as `?redirect=/login` (§D13 claimed
	// otherwise; it was wrong). Freezing it at the moment the guard fires also keeps the
	// right answer when a session expires mid-session: the page you were on, not the one
	// you first opened.
	const intended = useRef(pathname);
	if (session) intended.current = pathname;

	if (!session) {
		// With no signal, /login is a form that can't reach the server either — send the
		// player to the offline shelf, which needs nothing but this device (§D7).
		if (!online) return <Navigate to="/offline" />;
		// Hand the destination to the login screen so it lands back here (see _auth/layout).
		return <Navigate to="/login" search={{ redirect: intended.current }} />;
	}

	// Live mode and the print/PDF view are full-bleed (no app chrome); everything
	// else gets the nav.
	const fullBleed = pathname.startsWith("/live") || pathname.endsWith("/print");
	const section = Object.entries(SECTIONS).find(([p]) =>
		pathname.startsWith(p),
	)?.[1];

	if (fullBleed) return <Outlet />;

	// flex column + a growing main so the footer sits at the bottom of a short
	// screen rather than halfway up it — and, on a long one, below the content.
	return (
		<div className="flex min-h-dvh flex-col bg-background text-foreground">
			<AppNav section={section} />
			<main className="flex-1">
				<Outlet />
			</main>
			<SiteFooter />
		</div>
	);
}
