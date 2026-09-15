/**
 * Turn a failed mutation into something a player can read (CLAUDE.md §D27).
 *
 * The API sets a status with no body on purpose — a body would widen every route's
 * Eden-derived success type (see the comment on `onError` in api.ts) — so the reason has
 * to be written on the client, from the status. That makes surfacing an error opt-in per
 * call site, and almost nothing opted in: a failed save in the editor simply discarded
 * the work, silently.
 */

export type ErrorLike = { status?: number } | null | undefined;

/** The HTTP status behind a react-query error, when there is one. */
export function errorStatus(error: unknown): number | undefined {
	return (error as ErrorLike)?.status;
}

/**
 * A short, honest sentence for a failed write. `subject` names the thing that didn't
 * happen ("That change", "The song") so the copy reads as a statement rather than an
 * apology.
 */
export function mutationErrorMessage(
	error: unknown,
	subject = "That change",
): string {
	switch (errorStatus(error)) {
		case 400:
			return `${subject} wasn't saved — the server rejected it. Check the details and try again.`;
		case 401:
			return "You're signed out. Sign in again and retry.";
		case 403:
			return `${subject} wasn't saved — you don't have permission in this band.`;
		case 404:
			return `${subject} wasn't saved — it no longer exists. Reload to see the current state.`;
		case 409:
			return `${subject} wasn't saved — something else changed first. Reload and try again.`;
		case 413:
			return `${subject} wasn't saved — it's too large.`;
		case 429:
			return "Too many requests just now. Wait a moment and try again.";
		case 500:
		case 502:
		case 503:
			return `${subject} wasn't saved — the server had a problem. Try again shortly.`;
		default:
			return `${subject} wasn't saved. Check your connection and try again.`;
	}
}
