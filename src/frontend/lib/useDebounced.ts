import { useEffect, useState } from "react";

/**
 * A value, but only once it has stopped changing for `delayMs` (CLAUDE.md §D27).
 *
 * The Library's search box drove a full-library request per keystroke — typing
 * "yesterday" was nine unindexable `LIKE` scans, each returning everything. The box
 * itself stays fully controlled (a debounced *input* drops characters on a slow phone);
 * it is only the query that waits.
 */
export function useDebounced<T>(value: T, delayMs = 250): T {
	const [settled, setSettled] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setSettled(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);
	return settled;
}
