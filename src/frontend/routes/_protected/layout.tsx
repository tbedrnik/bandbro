import { AppNav } from "@frontend/components/AppNav";
import { useSession } from "@frontend/contexts/SessionContext";
import { useTheme } from "@frontend/lib/theme";
import {
	createFileRoute,
	Navigate,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";

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
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	if (!session) {
		return <Navigate to="/login" />;
	}

	// Live mode is full-bleed (its own chrome); everything else gets the nav.
	const isLive = pathname.startsWith("/live");
	const section = Object.entries(SECTIONS).find(([p]) =>
		pathname.startsWith(p),
	)?.[1];

	if (isLive) return <Outlet />;

	return (
		<div className="min-h-dvh bg-background text-foreground">
			<AppNav section={section} />
			<Outlet />
		</div>
	);
}
