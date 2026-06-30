import qrcode from "qrcode-generator";

/**
 * QR generation for the fan share sheet. Encodes the full session URL at
 * error-correction level M (matches the design prototype). Returns a GIF data URL,
 * rendered pixelated/crisp by the share UI.
 */
export function qrDataUrl(text: string): string {
	const qr = qrcode(0, "M");
	qr.addData(text);
	qr.make();
	return qr.createDataURL(10, 0);
}
