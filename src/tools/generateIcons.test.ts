import { describe, expect, test } from "bun:test";
import { inflateSync } from "node:zlib";

/**
 * The committed PWA icons must actually decode (CLAUDE.md §D7).
 *
 * They once didn't, and nothing caught it: `generateIcons.ts` encodes the PNG by hand and
 * wrote the IDAT as a raw DEFLATE stream (`Bun.deflateSync`) where the format calls for a
 * zlib one. Every chunk length and CRC was still correct, and `file(1)` still reported
 * "PNG image data, 192 x 192" — it only reads IHDR to say that — so the files looked fine
 * everywhere except in a decoder. Chrome dropped all three as unreadable, which cost the
 * manifest its icons and the app its installability: Android stopped offering to install
 * BandBro and offered a home-screen shortcut instead.
 *
 * So this test inflates them, which is the one check that would have failed.
 */

const publicDir = `${import.meta.dir}/../frontend/public`;

/** Minimal PNG reader: enough to prove a decoder can get pixels back out. */
function decodePng(bytes: Uint8Array) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

	let offset = 8;
	let width = 0;
	let height = 0;
	let colorType = -1;
	let bitDepth = -1;
	const idat: Uint8Array[] = [];

	while (offset < bytes.length) {
		const length = view.getUint32(offset);
		const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
		const data = bytes.subarray(offset + 8, offset + 8 + length);
		if (type === "IHDR") {
			width = view.getUint32(offset + 8);
			height = view.getUint32(offset + 12);
			bitDepth = data[8];
			colorType = data[9];
		}
		if (type === "IDAT") idat.push(data);
		offset += 12 + length;
	}

	const merged = new Uint8Array(idat.reduce((n, part) => n + part.length, 0));
	let at = 0;
	for (const part of idat) {
		merged.set(part, at);
		at += part.length;
	}
	// Throws on a raw DEFLATE stream ("incorrect header check") — the original defect.
	const raw = inflateSync(merged);
	return { width, height, bitDepth, colorType, raw };
}

// [file, the size the manifest declares for it]
const ICONS: [string, number][] = [
	["icon-192.png", 192],
	["icon-512.png", 512],
	["icon-maskable-512.png", 512],
];

describe("PWA icons", () => {
	for (const [name, size] of ICONS) {
		test(`${name} decodes at ${size}×${size}`, async () => {
			const bytes = new Uint8Array(
				await Bun.file(`${publicDir}/${name}`).arrayBuffer(),
			);
			const png = decodePng(bytes);
			expect(png.width).toBe(size);
			expect(png.height).toBe(size);
			expect(png.bitDepth).toBe(8);
			expect(png.colorType).toBe(2); // truecolour RGB
			// One filter byte per row, then three channels per pixel.
			expect(png.raw.length).toBe(size * (1 + size * 3));
		});
	}

	test("the manifest names exactly the icons that exist, at their real sizes", async () => {
		const manifest = await Bun.file(`${publicDir}/manifest.webmanifest`).json();
		const declared = manifest.icons.map(
			(icon: { src: string; sizes: string; type: string }) => ({
				file: icon.src.replace("/app/", ""),
				sizes: icon.sizes,
				type: icon.type,
			}),
		);
		expect(declared.map((d: { file: string }) => d.file).sort()).toEqual(
			ICONS.map(([name]) => name).sort(),
		);
		for (const icon of declared) {
			expect(icon.type).toBe("image/png");
			const size = ICONS.find(([name]) => name === icon.file)?.[1];
			expect(icon.sizes).toBe(`${size}x${size}`);
		}
	});

	// Chrome's installability floor is a 144px icon; the manifest must clear it, or the
	// browser offers a home-screen shortcut instead of an install.
	test("at least one icon is 192px or larger", () => {
		expect(Math.max(...ICONS.map(([, size]) => size))).toBeGreaterThanOrEqual(
			192,
		);
	});
});
