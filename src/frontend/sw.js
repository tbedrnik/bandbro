import { parsePushPayload } from "../shared/pushPayload";
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
 *
 * It also carries web push (§D21) — the `push` and `notificationclick` handlers below.
 * That is the whole reason a worker can report a finished PDF export at all: it is woken
 * by the OS, so it runs when the page that asked for the export has been frozen or closed.
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

/**
 * Web push (CLAUDE.md §D21). Today this is only ever a finished setlist PDF export, but
 * the handler is deliberately payload-driven rather than export-specific.
 *
 * A notification is shown for *every* push, without exception. The subscription is
 * `userVisibleOnly`, and a browser that sees a push produce no notification will show its
 * own "this site was updated in the background" message and, after a few, revoke the
 * permission outright. So `parsePushPayload` never throws and never returns a blank —
 * even an empty push (which services are allowed to send, and Chrome does) shows something.
 */
self.addEventListener("push", (event) => {
	const payload = parsePushPayload(event.data ? event.data.text() : null);

	event.waitUntil(
		(async () => {
			// Foreground tabs first: a page that is still alive should update from the
			// push rather than wait out the rest of its polling interval.
			const clients = await self.clients.matchAll({
				type: "window",
				includeUncontrolled: true,
			});
			for (const client of clients) {
				client.postMessage({ type: "bandbro-push", payload });
			}

			await self.registration.showNotification(payload.title, {
				body: payload.body,
				tag: payload.tag,
				icon: "/app/icon-192.png",
				badge: "/app/icon-192.png",
				data: { url: payload.url, ...payload.data },
			});
		})(),
	);
});

/**
 * Clicking the notification lands on the thing it is about — for an export, the setlist
 * with its Download button.
 *
 * An already-open app window is focused and told to route there, rather than opened
 * again: `client.navigate()` would reload the SPA and throw away transpose state, scroll
 * position and anything unsaved, and `openWindow` would leave the player with two copies
 * of the app. Only a window with no app open at all gets a fresh one.
 */
self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = event.notification.data?.url ?? "/app/";
	const target = new URL(url, self.location.origin);

	event.waitUntil(
		(async () => {
			const clients = await self.clients.matchAll({
				type: "window",
				includeUncontrolled: true,
			});
			for (const client of clients) {
				const open = new URL(client.url);
				if (open.origin !== target.origin) continue;
				if (!open.pathname.startsWith("/app")) continue;
				client.postMessage({
					type: "bandbro-navigate",
					url: target.pathname + target.search,
				});
				await client.focus();
				return;
			}
			await self.clients.openWindow(target.href);
		})(),
	);
});
