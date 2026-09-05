import { initials } from "@shared/initials";

/**
 * A cookie the marketing landing page can read (CLAUDE.md §D22).
 *
 * `/` is static, hand-written HTML with no React and no bundle (§D18), but it still has
 * to show "Log in / Sign up" to a stranger and "Go to app" to someone already signed in.
 * The real session cookie is httpOnly — as it must be — so the page cannot read it, and
 * asking the API would mean a network round trip and a visible flash of the wrong buttons
 * on the one surface whose whole point is painting instantly.
 *
 * So the app writes what the landing needs, and only that: two initials for the avatar.
 * The landing reads it synchronously in a `<head>` script, before first paint.
 *
 * **It is a hint, not authorization** — exactly like the session snapshot of §D7. It is
 * readable by script by design, it grants nothing, and every route behind `/app` still
 * goes through the server's own session check. Worst case it is stale (signed out on
 * another device, or the session expired): the landing offers "Go to app", the click
 * lands on the login screen, which is precisely what a bookmark would have done.
 */

const COOKIE = "bandbro_hint";
const MAX_AGE_DAYS = 30;

function write(value: string, maxAgeSeconds: number): void {
	if (typeof document === "undefined") return;
	// Lax rather than Strict: arriving from an external link (a shared invite, a search
	// result) must still show the signed-in landing.
	const attrs = [
		`${COOKIE}=${value}`,
		"path=/",
		"SameSite=Lax",
		`Max-Age=${maxAgeSeconds}`,
	];
	// Secure everywhere but a plain-http dev box, where it would silently do nothing.
	if (location.protocol === "https:") attrs.push("Secure");
	// The suggested Cookie Store API is still Chromium-only — absent in Safari, which is
	// half of what a band uses.
	// biome-ignore lint/suspicious/noDocumentCookie: Cookie Store is not in Safari
	document.cookie = attrs.join("; ");
}

/** Record that this browser has a session, and whose initials to draw. */
export function saveSessionHint(name: string): void {
	// Encoded: a name can hold anything, and a stray `;` would truncate the cookie.
	write(encodeURIComponent(initials(name)), MAX_AGE_DAYS * 24 * 60 * 60);
}

/** Drop it — a signed-out browser must see the landing's sign-up call, not "Go to app". */
export function clearSessionHint(): void {
	write("", 0);
}
