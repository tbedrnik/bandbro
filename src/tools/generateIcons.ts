import { deflateSync } from "node:zlib";

/**
 * Generator for the committed PWA icons (`bun run src/tools/generateIcons.ts`). Draws the BandBro mark (an amber "B" on the dark
 * stage surface) procedurally and encodes a PNG by hand — no image dependency needed.
 */

const BG = [0x16, 0x18, 0x1c];
const FG = [0xe8, 0xa1, 0x3a];

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(buf: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(data, 8);
	view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
	return out;
}

function png(width: number, height: number, rgb: Uint8Array): Uint8Array {
	const raw = new Uint8Array(height * (1 + width * 3));
	for (let y = 0; y < height; y++) {
		raw[y * (1 + width * 3)] = 0; // filter: none
		raw.set(
			rgb.subarray(y * width * 3, (y + 1) * width * 3),
			y * (1 + width * 3) + 1,
		);
	}
	const ihdr = new Uint8Array(13);
	const v = new DataView(ihdr.buffer);
	v.setUint32(0, width);
	v.setUint32(4, height);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // colour type: truecolour
	// zlib stream, not a raw DEFLATE one: PNG's IDAT is specified as a zlib datastream
	// (RFC 1950 — 2-byte header + Adler-32 trailer), and `Bun.deflateSync` returns the
	// bare RFC 1951 bytes. The result still passes a chunk/CRC check and still reports
	// its size to `file(1)`, because only IHDR is read to get that far — but no decoder
	// can inflate it, so Chrome rejected the icons and with them the whole manifest,
	// which is what stopped Android offering to install the app (§D7).
	const idat = new Uint8Array(deflateSync(raw));
	const parts = [
		new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk("IHDR", ihdr),
		chunk("IDAT", idat),
		chunk("IEND", new Uint8Array(0)),
	];
	const total = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(total);
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.length;
	}
	return out;
}

/** Signed distance to a rounded rectangle centred on (cx, cy). */
function sdRoundRect(
	x: number,
	y: number,
	cx: number,
	cy: number,
	hw: number,
	hh: number,
	r: number,
) {
	const qx = Math.abs(x - cx) - hw + r;
	const qy = Math.abs(y - cy) - hh + r;
	return (
		Math.min(Math.max(qx, qy), 0) +
		Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) -
		r
	);
}

/**
 * The letter B: a vertical stem plus two bowls, each bowl an ellipse ring clipped to the
 * right of the stem. Coordinates are glyph units on a 0..1 box; `(e - 1) / |grad e|`
 * turns the implicit ellipse into a near-euclidean distance, so the stroke keeps an even
 * weight all the way round instead of fattening where the ellipse is flat.
 */
function sdB(x: number, y: number) {
	const stemX = 0.275;
	const stroke = 0.078;
	let d = sdRoundRect(x, y, stemX, 0.5, stroke, 0.45, 0.025);
	for (const [cy, ry] of [
		[0.268, 0.218],
		[0.712, 0.238],
	]) {
		const rx = 0.5;
		const ex = (x - stemX) / rx;
		const ey = (y - cy) / ry;
		const e = Math.hypot(ex, ey);
		const grad =
			Math.hypot((x - stemX) / (rx * rx), (y - cy) / (ry * ry)) /
			Math.max(e, 1e-6);
		const ring = Math.abs(e - 1) / Math.max(grad, 1e-6) - stroke;
		d = Math.min(d, Math.max(ring, stemX - x));
	}
	return d;
}

function render(size: number, pad: number): Uint8Array {
	const rgb = new Uint8Array(size * size * 3);
	const ss = 3; // supersample factor for smooth edges
	const glyph = 1 - 2 * pad;
	for (let py = 0; py < size; py++) {
		for (let px = 0; px < size; px++) {
			let cov = 0;
			for (let sy = 0; sy < ss; sy++) {
				for (let sx = 0; sx < ss; sx++) {
					const u = ((px + (sx + 0.5) / ss) / size - pad) / glyph;
					const w = ((py + (sy + 0.5) / ss) / size - pad) / glyph;
					if (sdB(u, w) <= 0) cov++;
				}
			}
			const a = cov / (ss * ss);
			const o = (py * size + px) * 3;
			for (let c = 0; c < 3; c++)
				rgb[o + c] = Math.round(BG[c] + (FG[c] - BG[c]) * a);
		}
	}
	return png(size, size, rgb);
}

const dir = `${import.meta.dir}/../frontend/public`;
// "any" icons carry the mark near the edges; the maskable one keeps it inside the
// 40% safe zone so Android's circle/squircle mask never clips it.
await Bun.write(`${dir}/icon-192.png`, render(192, 0.2));
await Bun.write(`${dir}/icon-512.png`, render(512, 0.2));
await Bun.write(`${dir}/icon-maskable-512.png`, render(512, 0.3));
console.log("ok");
