/**
 * Where to send someone after they sign in. The destination arrives in a `?redirect=` search
 * param (set by the protected-route guard and by the join page), i.e. from the URL bar — so
 * it is only ever followed when it is a path inside this app. A protocol-relative "//evil.com"
 * parses as a path but navigates off-site, hence the second guard.
 */
export function safeRedirect(to: string | undefined, fallback = "/"): string {
	if (!to?.startsWith("/") || to.startsWith("//")) return fallback;
	return to;
}
