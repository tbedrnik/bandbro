import { canWrite } from "@backend/permissions";
import { api } from "@frontend/api";
import { useQuery } from "@tanstack/react-query";
import { useOnline } from "./offline";

/**
 * What the viewer may actually do in each band (CLAUDE.md §D27, task §G2).
 *
 * `songsRead` has returned `viewerCanWrite` for a long time and exactly two places in the
 * whole frontend consumed it. Everything else showed every write control to everyone, so
 * a Reader could drag a setlist into a new order, add a song, or open the editor and type
 * — and then the server refused, which (before the error work in this batch) produced
 * nothing on screen at all. Hiding the control is the honest version: §D7 already
 * establishes that an action you cannot perform is removed rather than greyed out.
 */
export function useBandRoles() {
	const online = useOnline();
	const { data, isPending } = useQuery({
		...api.bands.memberships.get.queryOptions({}),
		enabled: online,
		retry: online ? 3 : false,
		staleTime: 60 * 1000,
	});

	const roles = new Map((data ?? []).map((b) => [b.id, b.role]));

	return {
		isPending,
		/** The viewer's stored role in a band, or null if they aren't a member. */
		roleIn: (organizationId: string | null | undefined) =>
			organizationId ? (roles.get(organizationId) ?? null) : null,
		/**
		 * Whether the viewer may create/update/delete in a band. Curated (a null scope) is
		 * never writable, which mirrors `requireWrite` on the server.
		 *
		 * Optimistic while the roles are still loading: a writer briefly seeing their own
		 * buttons is right far more often than a writer watching them pop in.
		 */
		canWriteIn: (organizationId: string | null | undefined) => {
			if (!organizationId) return false;
			if (isPending || !data) return true;
			return canWrite(roles.get(organizationId));
		},
	};
}
