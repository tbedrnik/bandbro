import { useSession } from "@frontend/contexts/SessionContext";
import { safeRedirect } from "@frontend/lib/redirect";
import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth")({
	// Where to go once signed in. Set by the protected-route guard and by the public join
	// page, which sends a prospective bandmate here and wants them back (CLAUDE.md §D13).
	validateSearch: (search: Record<string, unknown>) => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	}),
	component: () => {
		const session = useSession({ optional: true });
		const { redirect } = Route.useSearch();

		if (session) {
			// An already-resolved in-app path, so it is none of the router's literal `to`
			// values — hence the cast. `safeRedirect` keeps it inside the app.
			return <Navigate to={safeRedirect(redirect) as "/"} />;
		}

		return <Outlet />;
	},
});
