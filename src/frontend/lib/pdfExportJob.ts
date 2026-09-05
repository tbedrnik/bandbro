import { useCallback, useState } from "react";

/**
 * The id of the setlist PDF export currently being rendered for a setlist, remembered
 * per device (CLAUDE.md §D20).
 *
 * The export is a job, so the thing that connects a click to a download is a job id —
 * and holding it in component state meant it died with the component. Navigating off the
 * setlist, or reloading the page, orphaned a render that then completed on the server
 * with nobody left to ask for the file. Kept in localStorage next to the other
 * per-device state (§D14), the button re-attaches to the running job on the way back.
 *
 * Keyed by setlist because that is where the button lives; two setlists can be
 * exporting at once without either forgetting the other.
 */

const key = (songbookId: string) => `bandbro:pdf-export:${songbookId}`;

function read(songbookId: string): string | null {
	try {
		return localStorage.getItem(key(songbookId));
	} catch {
		// private mode / storage disabled — the job still works for this visit
		return null;
	}
}

/** The remembered job for a setlist, and a setter that writes through to storage. */
export function usePdfExportJob(songbookId: string) {
	const [jobId, setJobId] = useState(() => read(songbookId));

	const remember = useCallback(
		(next: string | null) => {
			setJobId(next);
			try {
				if (next) localStorage.setItem(key(songbookId), next);
				else localStorage.removeItem(key(songbookId));
			} catch {
				// ignore — the in-memory state above is enough for this visit
			}
		},
		[songbookId],
	);

	return [jobId, remember] as const;
}
