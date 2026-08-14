import { fetchKytaryChordpro, KytaryFetchError } from "../../shared/kytary";
import { HttpError, requireWrite } from "./scope";
import { songsCreate } from "./songsCreate";

/**
 * Hosts we will fetch on a user's behalf. The URL comes from the client, so this
 * allowlist is what keeps the endpoint from being used to probe the network from
 * inside the server (SSRF) — extend it deliberately, per supported importer.
 */
const ALLOWED_HOSTS = new Set(["akordy.kytary.cz", "www.akordy.kytary.cz"]);

export type SongImportPayload = {
	/** An akordy.kytary.cz song page. */
	url: string;
	/** Target scope — a band or personal organization id. */
	organizationId: string;
};

/** Validate + normalize the user-supplied URL, or reject it with a 400. */
function parseImportUrl(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new HttpError(400, `Not a URL: ${raw}`);
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new HttpError(400, `Unsupported protocol: ${url.protocol}`);
	}
	if (!ALLOWED_HOSTS.has(url.hostname)) {
		throw new HttpError(400, `Unsupported host: ${url.hostname}`);
	}
	// Drop any query/fragment — song pages don't use them, and this keeps the
	// `{x_source}` we store canonical.
	url.search = "";
	url.hash = "";
	return url;
}

/**
 * Import a song from akordy.kytary.cz into a writable scope: fetch the page,
 * convert it to ChordPro (`src/shared/kytary.ts`), then create it through the
 * normal `songsCreate` path so metadata/credits/tags are derived the same way as
 * a hand-authored song. Returns the created song — the client opens its editor.
 */
export async function songsImport({
	userId,
	payload,
}: {
	userId: string;
	payload: SongImportPayload;
}) {
	// Validate the URL and the caller's role *before* making any outbound request.
	const url = parseImportUrl(payload.url);
	await requireWrite(userId, payload.organizationId);

	const { chordpro, sheet } = await fetchSheet(url);

	return songsCreate({
		userId,
		payload: {
			name: sheet.title ?? "Imported song",
			organizationId: payload.organizationId,
			chart: {
				content: chordpro,
				description: `Imported from ${url.hostname}`,
			},
		},
	});
}

async function fetchSheet(url: URL) {
	try {
		return await fetchKytaryChordpro(url.href);
	} catch (error) {
		if (error instanceof KytaryFetchError) {
			throw new HttpError(
				error.status === 404 ? 404 : 502,
				`Could not fetch ${url.href}: ${error.message}`,
			);
		}
		// The page loaded but held no chord sheet (wrong page, or markup changed).
		throw new HttpError(422, `No chord sheet at ${url.href}: ${error}`);
	}
}
