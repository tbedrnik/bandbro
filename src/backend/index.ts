import frontend from "../frontend/index.html";
import landing from "../landing/index.html";
import { api } from "./api";

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

// Run @tanstack/router-cli watch if in development
if (isDev) {
	Bun.spawn(["bun", "run", "tsr", "watch"], {
		stdout: "inherit",
		stderr: "inherit",
	});
}
