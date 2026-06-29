import frontend from "../frontend/index.html";
import landing from "../landing/index.html";
import { api } from "./api";

const isDev = process.env.NODE_ENV === "development";

const publicDir = `${import.meta.dir}/../frontend/public`;

// PWA assets (CLAUDE.md §D7). Served under /app so the service worker's scope
// covers the app. Service-Worker-Allowed lets sw.js control the whole /app tree.
function serveSw() {
	return new Response(Bun.file(`${publicDir}/sw.js`), {
		headers: {
			"Content-Type": "text/javascript",
			"Service-Worker-Allowed": "/app/",
			"Cache-Control": "no-cache",
		},
	});
}
function serveManifest() {
	return new Response(Bun.file(`${publicDir}/manifest.webmanifest`), {
		headers: { "Content-Type": "application/manifest+json" },
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
		"/app": frontend, // bare path (PWA start_url) + the SPA basepath
		"/app/*": frontend, // matches with basepath in frontend
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
