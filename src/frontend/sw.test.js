import { describe, expect, test } from "bun:test";

/**
 * Drives the real service worker (src/frontend/sw.js) against a fake Cache API and a fake
 * network, because the thing that actually broke for users — the installed app opening to
 * nothing with no signal — is a property of these handlers, not of any one helper.
 *
 * Plain .js so it can import the worker source directly; the worker is not part of the
 * SPA's TypeScript program.
 */

const ORIGIN = "https://bandbro.test";

/** The markup Bun.serve emits for /app/ — asset hrefs carry `..` segments. */
const SHELL_HTML = `<!doctype html><html><head><title>BandBro</title>
<link rel="stylesheet" crossorigin href="/../../chunk-abc.css"><script type="module" crossorigin src="/../../chunk-def.js"></script></head>
<body><div id="root"></div></body></html>`;

function makeCaches() {
	const stores = new Map();
	const cacheFor = (name) => {
		if (!stores.has(name)) stores.set(name, new Map());
		const entries = stores.get(name);
		return {
			entries,
			async put(key, response) {
				const url =
					typeof key === "string" ? new URL(key, ORIGIN).href : key.url;
				entries.set(url, response);
			},
			async match(key) {
				const url =
					typeof key === "string" ? new URL(key, ORIGIN).href : key.url;
				return entries.get(url);
			},
		};
	};
	return {
		stores,
		api: {
			async open(name) {
				return cacheFor(name);
			},
			async keys() {
				return [...stores.keys()];
			},
			async delete(name) {
				return stores.delete(name);
			},
		},
	};
}

/** A network that serves the app and can be switched off. */
function makeNetwork() {
	const net = {
		online: true,
		requests: [],
		routes: {
			"/app/": () =>
				new Response(SHELL_HTML, { headers: { "Content-Type": "text/html" } }),
			"/app/live/x": () =>
				new Response(SHELL_HTML, { headers: { "Content-Type": "text/html" } }),
			"/chunk-abc.css": () =>
				new Response("body{}", { headers: { "Content-Type": "text/css" } }),
			"/chunk-def.js": () =>
				new Response("console.log(1)", {
					headers: { "Content-Type": "text/javascript" },
				}),
			"/app/manifest.webmanifest": () => new Response("{}"),
			"/app/icon-192.png": () => new Response("png"),
			"/app/icon-512.png": () => new Response("png"),
			"/app/icon-maskable-512.png": () => new Response("png"),
		},
	};
	net.fetch = async (input) => {
		const url = new URL(typeof input === "string" ? input : input.url, ORIGIN);
		net.requests.push(url.pathname);
		if (!net.online) throw new TypeError("Failed to fetch");
		const route = net.routes[url.pathname];
		if (!route) return new Response("not found", { status: 404 });
		return route();
	};
	return net;
}

const handlers = {};
const caches = makeCaches();
const network = makeNetwork();

Object.defineProperty(globalThis, "self", {
	configurable: true,
	value: {
		location: new URL(`${ORIGIN}/app/sw.js`),
		addEventListener: (type, fn) => {
			handlers[type] = fn;
		},
		skipWaiting: async () => {},
		clients: { claim: async () => {} },
	},
});
Object.defineProperty(globalThis, "caches", {
	configurable: true,
	value: caches.api,
});
globalThis.fetch = network.fetch;

await import("./sw.js");

/** Run the install handler to completion, from an empty cache. */
async function install() {
	caches.stores.clear();
	const pending = [];
	await handlers.install({ waitUntil: (p) => pending.push(p) });
	await Promise.allSettled(pending);
}

/** Put a request through the fetch handler; undefined means "not intercepted". */
async function request(url, init = {}) {
	const req = new Request(new URL(url, ORIGIN), { ...init });
	// Request.mode isn't settable, so carry navigations on the event object the way the
	// browser does and let the handler read it off the request stand-in.
	const stand = { url: req.url, method: req.method, mode: init.mode ?? "cors" };
	let responded;
	const pending = [];
	handlers.fetch({
		request: stand,
		respondWith: (p) => {
			responded = p;
		},
		waitUntil: (p) => pending.push(p),
	});
	const res = responded === undefined ? undefined : await responded;
	await Promise.allSettled(pending);
	return res;
}

describe("service worker", () => {
	test("install precaches the shell and the hashed bundle it points at", async () => {
		await install();
		const cache = await caches.api.open([...caches.stores.keys()][0]);
		expect([...cache.entries.keys()].sort()).toEqual([
			`${ORIGIN}/app/`,
			`${ORIGIN}/app/icon-192.png`,
			`${ORIGIN}/app/icon-512.png`,
			`${ORIGIN}/app/icon-maskable-512.png`,
			`${ORIGIN}/app/manifest.webmanifest`,
			// The `/../../` hrefs resolved to the root paths the browser will request.
			`${ORIGIN}/chunk-abc.css`,
			`${ORIGIN}/chunk-def.js`,
		]);
	});

	test("with the network off, any /app route still boots the cached shell", async () => {
		await install();
		network.online = false;

		const nav = await request("/app/live/x", { mode: "navigate" });
		expect(nav?.status).toBe(200);
		expect(await nav.text()).toContain('<div id="root">');

		// …and the bundle it asks for next comes out of the cache too.
		const js = await request("/chunk-def.js");
		expect(await js.text()).toBe("console.log(1)");
		const css = await request("/chunk-abc.css");
		expect(await css.text()).toBe("body{}");

		network.online = true;
	});

	test("API calls are left alone — offline setlists come from localStorage, not here", async () => {
		await install();
		expect(await request("/api/songbooks")).toBeUndefined();
	});

	test("an online navigation refreshes the cached shell and its assets together", async () => {
		await install();
		const cache = await caches.api.open([...caches.stores.keys()][0]);
		// A rebuild: same shell URL, new hashes.
		const rebuilt = SHELL_HTML.replace("chunk-abc", "chunk-new").replace(
			"chunk-def",
			"chunk-new2",
		);
		network.routes["/app/live/x"] = () =>
			new Response(rebuilt, { headers: { "Content-Type": "text/html" } });
		network.routes["/chunk-new.css"] = () => new Response("body{new}");
		network.routes["/chunk-new2.js"] = () => new Response("console.log(2)");

		await request("/app/live/x", { mode: "navigate" });

		expect(await (await cache.match("/app/")).text()).toContain(
			"chunk-new2.js",
		);
		expect(await (await cache.match("/chunk-new2.js")).text()).toBe(
			"console.log(2)",
		);
	});
});
