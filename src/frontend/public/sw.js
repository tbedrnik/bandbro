/**
 * BandBro service worker — precaches the app shell so /app boots with no signal
 * (CLAUDE.md §D7). Navigations: network-first, falling back to the cached shell.
 * Same-origin static assets (JS/CSS/fonts): stale-while-revalidate. API requests are
 * never cached here — Live mode reads its own per-playlist snapshot from localStorage.
 */

const CACHE = "bandbro-shell-v1";

self.addEventListener("install", () => {
	self.skipWaiting();
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

	// Navigations → network-first, fall back to cached shell.
	if (request.mode === "navigate") {
		event.respondWith(
			(async () => {
				try {
					const res = await fetch(request);
					const cache = await caches.open(CACHE);
					cache.put("/app", res.clone());
					return res;
				} catch {
					const cache = await caches.open(CACHE);
					return (
						(await cache.match("/app")) ??
						(await cache.match(request)) ??
						Response.error()
					);
				}
			})(),
		);
		return;
	}

	// Static assets → stale-while-revalidate.
	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			const cached = await cache.match(request);
			const network = fetch(request)
				.then((res) => {
					if (res.ok) cache.put(request, res.clone());
					return res;
				})
				.catch(() => cached);
			return cached ?? network;
		})(),
	);
});
