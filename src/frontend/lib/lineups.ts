import { api } from "@frontend/api";
import { useQuery } from "@tanstack/react-query";
import { useOnline } from "./offline";

export {
	defaultLineupOf,
	hasMultipleLineups,
	lineupLabel,
	lineupOptionLabel,
	lineupsOf,
} from "../../shared/lineups";

/**
 * Every lineup across the bands the user belongs to (CLAUDE.md §D25). Server-backed, so
 * it simply doesn't run offline — the screens that use it hide their lineup controls
 * when there is no signal, which is the §D7 rule anyway.
 */
export function useLineups(organizationId?: string) {
	const online = useOnline();
	return useQuery({
		...api.lineups.get.queryOptions(organizationId ? { organizationId } : {}),
		enabled: online,
		retry: online ? 3 : false,
	});
}
