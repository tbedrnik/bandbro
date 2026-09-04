import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import { routeTree } from "../generated/tanstack-router/routeTree.gen";

const queryClient = new QueryClient();

const router = createRouter({
	basepath: "/app", // matches with basepath in backend
	routeTree,
	scrollRestoration: true,
	defaultPreload: "intent",
	defaultPendingComponent: () => "loading...",
	context: { queryClient },
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}

	interface HistoryState {}
}

const root =
	document.getElementById("root") ??
	(() => {
		const root = document.createElement("div");
		root.id = "root";
		document.body.prepend(root);
		return root;
	})();

ReactDOM.createRoot(root).render(
	<React.StrictMode>
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	</React.StrictMode>,
);

// Link the web app manifest and the home-screen icon at runtime (kept out of index.html
// so the bundler doesn't try to resolve these runtime-served paths). iOS ignores the
// manifest's icons entirely, hence the separate apple-touch-icon.
for (const [rel, href] of [
	["manifest", "/app/manifest.webmanifest"],
	["apple-touch-icon", "/app/icon-192.png"],
	["icon", "/app/icon-192.png"],
]) {
	const link = document.createElement("link");
	link.rel = rel;
	link.href = href;
	document.head.appendChild(link);
}

// Register the service worker for offline app-shell support (CLAUDE.md §D7).
//
// Scope is "/", not "/app/": Bun serves the SPA's content-hashed bundle from the origin
// root (/chunk-<hash>.js), so a worker confined to /app/ can never cache the files the
// app needs to start — which is why the installed PWA used to open to a blank screen with
// no signal. The server sends `Service-Worker-Allowed: /` to permit the wider scope.
if ("serviceWorker" in navigator) {
	window.addEventListener("load", async () => {
		try {
			await navigator.serviceWorker.register("/app/sw.js", { scope: "/" });
			// Retire the old /app/-scoped registration from earlier installs; two workers
			// would otherwise both claim /app/* and the narrower one would keep winning.
			for (const reg of await navigator.serviceWorker.getRegistrations()) {
				if (new URL(reg.scope).pathname !== "/") await reg.unregister();
			}
		} catch {
			// No service worker (unsupported, or insecure origin) — the app still works
			// online; it just won't boot without a connection.
		}
	});
}
