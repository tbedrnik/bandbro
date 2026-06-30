/**
 * Fan-session URLs and per-device identity (CLAUDE.md fan-experience handoff).
 *
 * The design specifies a `bandbro.live/s/<code>` share URL. In this single-app build the
 * fan view lives at `/app/s/<code>`, so we encode the *real, reachable* origin in the QR
 * and copy-link (a QR that points at a domain that doesn't resolve to this deployment can't
 * be scanned) while showing a clean host-relative pill. A production reverse-proxy can map
 * bandbro.live → this app without any code change.
 */

const CLIENT_ID_KEY = "bandbro:fan:clientId";

/** App origin + basepath, e.g. `https://example.com/app`. */
function appBase(): string {
	if (typeof window === "undefined") return "/app";
	return `${window.location.origin}/app`;
}

/** Full, scannable/clipboard URL for a session code. */
export function fanUrl(code: string): string {
	return `${appBase()}/s/${code.toLowerCase()}`;
}

/** Short display form shown in the URL pill (no protocol). */
export function fanDisplayUrl(code: string): string {
	if (typeof window === "undefined") return `…/s/${code.toLowerCase()}`;
	return `${window.location.host}/app/s/${code.toLowerCase()}`;
}

/**
 * A stable, anonymous per-device id used only to size the live "watching" count.
 * Lives in sessionStorage so a fan counts once per tab and is forgotten when it closes.
 */
export function getClientId(): string {
	if (typeof sessionStorage === "undefined") {
		return Math.random().toString(36).slice(2);
	}
	let id = sessionStorage.getItem(CLIENT_ID_KEY);
	if (!id) {
		id = crypto.randomUUID();
		sessionStorage.setItem(CLIENT_ID_KEY, id);
	}
	return id;
}
