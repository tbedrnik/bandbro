import { describe, expect, test } from "bun:test";
import { extractShellAssets } from "./shellAssets";

const BASE = "https://bandbro.test/app";

describe("extractShellAssets", () => {
	test("resolves the ../-prefixed hrefs Bun.serve emits for /app", () => {
		// Verbatim shape of what `Bun.serve({ routes: { "/app": frontend } })` returns:
		// the asset hrefs are written relative to the route depth, so they carry `..`
		// segments that only normalize once the browser (or URL) resolves them.
		const html = `<!doctype html><html><head><title>BandBro</title>
<link rel="stylesheet" crossorigin href="/../../chunk-4eggytcy.css"><script type="module" crossorigin src="/../../chunk-rpwvpe63.js"></script></head>
<body><div id="root"></div></body></html>`;
		expect(extractShellAssets(html, BASE)).toEqual([
			"https://bandbro.test/chunk-4eggytcy.css",
			"https://bandbro.test/chunk-rpwvpe63.js",
		]);
	});

	test("resolves the ./-relative hrefs `bun build` emits", () => {
		const html = `<link rel="stylesheet" href="./index-ep9j9cmn.css"><script src="./index-ms6ta2nr.js"></script>`;
		expect(extractShellAssets(html, BASE)).toEqual([
			"https://bandbro.test/index-ep9j9cmn.css",
			"https://bandbro.test/index-ms6ta2nr.js",
		]);
	});

	test("picks up modulepreload and the manifest, skips other rels", () => {
		const html = `
			<link rel="modulepreload" href="/chunk-a.js">
			<link rel="manifest" href="/app/manifest.webmanifest">
			<link rel="icon" href="/app/icon-192.png">
			<link rel="dns-prefetch" href="/whatever">`;
		expect(extractShellAssets(html, BASE)).toEqual([
			"https://bandbro.test/chunk-a.js",
			"https://bandbro.test/app/manifest.webmanifest",
		]);
	});

	test("ignores inline scripts, data: URIs and other origins", () => {
		const html = `
			<script>console.log("inline")</script>
			<script src="data:text/javascript,void 0"></script>
			<script src="https://cdn.example.com/x.js"></script>
			<link rel="stylesheet" href="data:text/css,body{}">
			<script src="/keep.js"></script>`;
		expect(extractShellAssets(html, BASE)).toEqual([
			"https://bandbro.test/keep.js",
		]);
	});

	test("dedupes and tolerates single quotes and unquoted attributes", () => {
		const html = `<script src='/a.js'></script><script src=/a.js></script><script src="/a.js"></script>`;
		expect(extractShellAssets(html, BASE)).toEqual([
			"https://bandbro.test/a.js",
		]);
	});

	test("returns nothing for markup with no assets", () => {
		expect(extractShellAssets("<html><body>hi</body></html>", BASE)).toEqual(
			[],
		);
	});
});
