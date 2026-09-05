import frontend from "../frontend/index.html";
import landing from "../landing/index.html";
import { api } from "./api";
import { startPdfExportWorker } from "./services/pdfExports";

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
		"/api/*": api.fetch,
		"/app/sw.js": serveSw,
		"/app/manifest.webmanifest": serveManifest,
		"/app/icon-192.png": serveIcon("icon-192.png"),
		"/app/icon-512.png": serveIcon("icon-512.png"),
		"/app/icon-maskable-512.png": serveIcon("icon-maskable-512.png"),
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

// Run @tanstack/router-cli watch if in development
if (isDev) {
	Bun.spawn(["bun", "run", "tsr", "watch"], {
		stdout: "inherit",
		stderr: "inherit",
	});
}
