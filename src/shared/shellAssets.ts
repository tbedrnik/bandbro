/**
 * Pulls the app-shell's asset URLs out of the served SPA HTML (CLAUDE.md §D7).
 *
 * Bun serves the SPA from an HTML import, so the bundle's filenames are content-hashed
 * and change on every rebuild — there is no fixed list a service worker could hardcode.
 * The one thing that *is* stable is the shell document itself (`/app`), so the service
 * worker fetches it and reads the `<script>`/`<link>` URLs back out of the markup. That
 * survives a rebuild for free: new hashes arrive in the HTML and precaching follows them.
 *
 * Deliberately a regex scan rather than a parser: a service worker has no DOMParser, and
 * the shell is generated markup with no user content in it.
 */

const TAG = /<(script|link)\b([^>]*)>/gi;
const ATTR = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function attributes(raw: string): Record<string, string> {
	const out: Record<string, string> = {};
	ATTR.lastIndex = 0;
	let m = ATTR.exec(raw);
	while (m) {
		out[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
		m = ATTR.exec(raw);
	}
	return out;
}

/** `rel` values whose target is part of the shell and must be cached with it. */
const CACHEABLE_REL = new Set([
	"stylesheet",
	"modulepreload",
	"preload",
	"manifest",
]);

/**
 * Absolute, same-origin URLs the shell HTML needs to boot, deduped, in document order.
 *
 * `base` is the URL the HTML was served from — asset hrefs are relative to it, and Bun
 * emits them with `../` segments (`/../../chunk-abc.js` when the shell is served at
 * `/app`), which `URL` normalizes exactly the way the browser does before requesting them.
 */
export function extractShellAssets(html: string, base: string): string[] {
	const origin = new URL(base).origin;
	const seen = new Set<string>();
	TAG.lastIndex = 0;
	let m = TAG.exec(html);
	while (m) {
		const tag = m[1].toLowerCase();
		const attrs = attributes(m[2]);
		const href =
			tag === "script"
				? attrs.src
				: CACHEABLE_REL.has((attrs.rel ?? "").toLowerCase())
					? attrs.href
					: undefined;
		m = TAG.exec(html);
		// Inline <script>, data: URIs (the fonts are inlined into the CSS) and any
		// third-party CDN are not ours to cache.
		if (!href || href.startsWith("data:")) continue;
		let resolved: URL;
		try {
			resolved = new URL(href, base);
		} catch {
			continue;
		}
		if (resolved.origin !== origin) continue;
		seen.add(resolved.href);
	}
	return [...seen];
}
