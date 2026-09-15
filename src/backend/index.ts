import frontend from "../frontend/index.html";
import landing from "../landing/index.html";
import { api } from "./api";
import { prisma } from "./prisma";
import { startPdfExportWorker } from "./services/pdfExports";
import { startWatchdog } from "./watchdog";

const isDev = process.env.NODE_ENV === "development";

const publicDir = `${import.meta.dir}/../frontend/public`;

// PWA assets (CLAUDE.md §D7).
//
// The worker is bundled from src/frontend/sw.js at request time rather than served as a
// static file: it imports the shell-asset parser from src/shared, and there is no build
// step that would otherwise reach it (Bun bundles the SPA from its HTML import, and the
// worker is not part of that graph). One build per process, cached below.
//
// `Service-Worker-Allowed: /` is what lets a script served from /app/sw.js claim the
// whole origin. It has to: Bun serves the SPA's hashed bundle from the origin root
// (/chunk-<hash>.js), so a worker scoped to /app/ can never cache the files the app
// needs to boot — which is exactly why the installed app used to open to nothing
// offline. The worker itself still leaves / (the landing page) and /api alone.
let swBundle: Promise<string> | undefined;
function buildSw() {
	if (!swBundle || isDev) {
		swBundle = Bun.build({
			entrypoints: [`${import.meta.dir}/../frontend/sw.js`],
			target: "browser",
			minify: !isDev,
		})
			.then((result) => result.outputs[0].text())
			.catch((error) => {
				swBundle = undefined; // don't cache a failure — retry on the next request
				throw error;
			});
	}
	return swBundle;
}

async function serveSw() {
	return new Response(await buildSw(), {
		headers: {
			"Content-Type": "text/javascript",
			"Service-Worker-Allowed": "/",
			"Cache-Control": "no-cache",
		},
	});
}
function serveManifest() {
	return new Response(Bun.file(`${publicDir}/manifest.webmanifest`), {
		headers: { "Content-Type": "application/manifest+json" },
	});
}
function serveIcon(name: string) {
	return () =>
		new Response(Bun.file(`${publicDir}/${name}`), {
			headers: {
				"Content-Type": "image/png",
				"Cache-Control": "public, max-age=86400",
			},
		});
}

/**
 * Response headers for every surface we serve from a handler (CLAUDE.md §D27).
 *
 * **Known gap, stated rather than papered over:** the three HTML surfaces (`/`, `/app`,
 * `/app/*` — which includes the public fan view) are served by Bun from an `HTMLBundle`
 * route, and `Bun.serve` exposes no hook to touch those responses. `server.fetch()` does
 * not re-enter routing ("fetch() requires the server to have a fetch handler"), so there
 * is no in-process way to wrap them either. Getting headers onto the HTML means either
 * building the SPA to static files and serving them ourselves — which would mean
 * re-implementing the asset layout §D7's service worker depends on — or a proxy in front.
 * Until then the pages carry none of these, so no CSP is shipped at all: a policy that
 * covers only the JSON API protects nothing, and claiming one would be worse than the gap.
 */
function withSecurityHeaders(request: Request, response: Response): Response {
	const headers = response.headers;
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
	headers.set("X-Frame-Options", "DENY");
	// HSTS is a promise the browser remembers for a year, so only make it on a request
	// that actually arrived over TLS — otherwise a laptop running `bun run dev` would
	// lock itself out of http://localhost:3000 for twelve months. Behind Railway's edge
	// the TLS terminates upstream, hence the forwarded header.
	const forwarded = request.headers.get("x-forwarded-proto");
	const scheme =
		forwarded?.split(",")[0].trim() ?? new URL(request.url).protocol;
	if (scheme === "https" || scheme === "https:") {
		headers.set(
			"Strict-Transport-Security",
			"max-age=31536000; includeSubDomains",
		);
	}
	return response;
}

/** Wrap a route handler so whatever it answers carries the headers above. */
function secured(
	handler: (request: Request) => Response | Promise<Response>,
): (request: Request) => Promise<Response> {
	return async (request) =>
		withSecurityHeaders(request, await handler(request));
}

const server = Bun.serve({
	// Bind to all interfaces and the platform-provided port. Without an explicit
	// hostname, Bun.serve binds to localhost (127.0.0.1) once $PORT is set, which
	// makes the container unreachable from a PaaS router (Railway/Fly/etc.) — the
	// process runs but looks like it "never started".
	hostname: "0.0.0.0",
	port: Number(process.env.PORT) || 3000,
	// Bun closes a connection that has carried no data for `idleTimeout` seconds —
	// and it counts a request whose handler is still working as idle. The default is
	// 10s, which the server-side setlist PDF (a `chordpro` subprocess, §D8) blows
	// straight through on a small container: Bun dropped the socket, Railway's edge
	// read that as an upstream reset, retried the request twice more (spawning a
	// fresh render each time) and finally answered 502 — while every one of those
	// renders went on to succeed, unread, in the background. 255 is Bun's maximum.
	// The PDF service caps its own runtime well under this (see songbooksPdf.ts).
	idleTimeout: 255,
	routes: {
		// Every route below that is a *handler* gets the security headers; the three
		// HTMLBundle routes at the bottom cannot — see `withSecurityHeaders`.
		"/api/*": secured((request) => api.fetch(request)),
		"/app/sw.js": secured(serveSw),
		"/app/manifest.webmanifest": secured(serveManifest),
		"/app/icon-192.png": secured(serveIcon("icon-192.png")),
		"/app/icon-512.png": secured(serveIcon("icon-512.png")),
		"/app/icon-maskable-512.png": secured(serveIcon("icon-maskable-512.png")),
		"/app": frontend, // bare path + the SPA basepath
		"/app/*": frontend, // matches with basepath in frontend; also the PWA start_url "/app/"
		"/": landing,
	},
	development: isDev,
});

console.log(`🐲 Bun is running at http://${server.hostname}:${server.port}`);

// Fail any export left mid-render by a previous process, drop expired ones, and pick up
// anything still pending (CLAUDE.md §D20). Not awaited: the server should take traffic
// whether or not the queue is healthy, and a failure here must not stop the boot.
startPdfExportWorker().catch((error) => {
	console.error("[PDF] worker failed to start", error);
});

// Notice a wedge and exit, so the platform's restart policy has something to react to
// (§D17 documented that nothing else can). Five consecutive failures of the same
// `SELECT 1` the healthcheck runs, 30s apart: two and a half minutes of a database that
// cannot be read is not a slow query under a PDF render, it is a dead container.
startWatchdog({
	check: () => prisma.$queryRaw`SELECT 1`,
	onDead: (failures, error) => {
		console.error(
			`[watchdog] ${failures} consecutive failed checks — exiting`,
			error,
		);
		process.exit(1);
	},
});

// Run @tanstack/router-cli watch if in development
if (isDev) {
	Bun.spawn(["bun", "run", "tsr", "watch"], {
		stdout: "inherit",
		stderr: "inherit",
	});
}
