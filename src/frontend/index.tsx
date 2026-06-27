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

// Link the web app manifest at runtime (kept out of index.html so the bundler
// doesn't try to resolve the runtime-served path).
const manifestLink = document.createElement("link");
manifestLink.rel = "manifest";
manifestLink.href = "/app/manifest.webmanifest";
document.head.appendChild(manifestLink);

// Register the service worker for offline app-shell support (CLAUDE.md §D7).
if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker
			.register("/app/sw.js", { scope: "/app/" })
			.catch(() => {});
	});
}
