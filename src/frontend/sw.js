import { extractShellAssets } from "../shared/shellAssets";

/**
 * BandBro service worker — the app shell, cached so an installed PWA boots with no
 * signal (CLAUDE.md §D7). Bundled at request time by `serveSw()` in the backend, which
 * is why this file may import from `src/shared` even though it never runs in the SPA.
 *
 * Two things it must get right, both of which the first version got wrong:
 *
 * 1. **Scope.** Bun serves the SPA's hashed bundle from the *origin root*
 *    (`/chunk-<hash>.js`), not from under `/app`. A worker scoped to `/app/` therefore
 *    could never see — let alone cache — the very files the shell needs, so the app
 *    booted to a blank page offline. This worker is registered at scope `/` (the server
 *    sends `Service-Worker-Allowed: /`) and simply leaves the marketing landing page and
 *    `/api` alone.
 *
 * 2. **Precaching.** The bundle's filenames are content-hashed, so there is no fixed list
 *    to precache. On install we fetch the shell document and read its `<script>`/`<link>`
 *    URLs back out of the markup (`extractShellAssets`), then cache document and assets
 *    together. Every online navigation refreshes that pair, so the cached HTML and the
 *    cached hashes never drift apart across a rebuild.
 *
 * API responses are never cached here: a setlist's offline copy is an explicit user
 * action, snapshotted by `lib/offline.ts` into localStorage.
 */

const CACHE = "bandbro-shell-v2";

/** The shell document. Every /app/* navigation falls back to this one entry. */
const SHELL = "/app/";

/** Static, unhashed extras that are part of an installable app. */
const EXTRAS = [
	"/app/manifest.webmanifest",
	"/app/icon-192.png",
	"/app/icon-512.png",
	"/app/icon-maskable-512.png",
];

/**
 * Store the shell document under the single {@link SHELL} key plus everything it
 * references. Individually settled rather than `cache.addAll`, which is all-or-nothing —
 * one 404 on an optional extra must not cost us the bundle.
 */
async function cacheShell(cache, html) {
	await cache.put(
		SHELL,
		new Response(html, {
			headers: { "Content-Type": "text/html;charset=utf-8" },
		}),
	);
	const urls = [
		...extractShellAssets(html, new URL(SHELL, self.location.origin).href),
		...EXTRAS,
	];
	await Promise.allSettled(
		urls.map(async (url) => {
			// Already held? Leave it. Bundle names carry a content hash, so a hit is by
			// definition current — and re-downloading a 3.6 MB bundle on every navigation
			// would be a heavy price for a shell that hasn't changed. The unhashed extras
			// refresh when CACHE is bumped, which is the lever for those.
			if (await cache.match(url)) return;
			const res = await fetch(url, { cache: "reload" });
			if (res.ok) await cache.put(url, res);
		}),
	);
}

async function precache() {
	const res = await fetch(SHELL, { cache: "reload" });
	if (!res.ok) return;
	const cache = await caches.open(CACHE);
	await cacheShell(cache, await res.text());
}

self.addEventListener("install", (event) => {
	// Precache before taking over: skipWaiting() with an empty cache would hand
	// control to a worker that has nothing to serve if the network drops meanwhile.
	event.waitUntil(precache().finally(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
			);
			await self.clients.claim();
		})(),
	);
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (url.pathname.startsWith("/api/")) return; // never cache API

	// Navigations → network-first, so a signed-in player always gets the current build;
	// offline, any /app/* URL resolves to the cached shell and the SPA routes from there.
	if (request.mode === "navigate") {
		event.respondWith(
			(async () => {
				try {
					const res = await fetch(request);
					if (res.ok && url.pathname.startsWith("/app")) {
						const html = await res.clone().text();
						const cache = await caches.open(CACHE);
						// Refresh document + assets together — see the header comment.
						event.waitUntil(cacheShell(cache, html));
					}
					return res;
				} catch {
					const cache = await caches.open(CACHE);
					if (url.pathname.startsWith("/app")) {
						const shell = await cache.match(SHELL);
						if (shell) return shell;
					}
					return (await cache.match(request)) ?? Response.error();
				}
			})(),
		);
		return;
	}

	// Everything else (the hashed bundle, icons, the manifest) → cache-first. The
	// filenames carry a content hash, so a cache hit is never stale; anything new is
	// fetched once and kept.
	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			const cached = await cache.match(request);
			if (cached) return cached;
			const res = await fetch(request);
			if (res.ok) await cache.put(request, res.clone());
			return res;
		})(),
	);
});
