/**
 * The wire shape of a web push message (CLAUDE.md §D21) — written by the server, read by
 * the service worker, which is why it lives here rather than on either side.
 *
 * The two ends are versioned independently and always will be: a service worker installed
 * weeks ago keeps running until the browser replaces it, so it can receive a payload from
 * a newer deploy, or an empty one (push services are allowed to wake a worker with no
 * data at all, and Chrome does). `parsePushPayload` is therefore total — every field has
 * a fallback and nothing throws — because the one thing a `push` handler must never do is
 * fail to show a notification. Browsers punish a silent push by revoking the permission.
 */

export type PushPayload = {
	title: string;
	body: string;
	/**
	 * Collapse key. A later notification with the same tag replaces the earlier one
	 * rather than stacking, so a retried export leaves one line in the shade, not four.
	 */
	tag: string;
	/** App URL to focus or open when the notification is clicked. */
	url: string;
	/**
	 * Handed to open clients via `postMessage` so a foreground tab can refresh from the
	 * push instead of waiting for its next poll.
	 */
	data?: PushData;
};

export type PushData = {
	kind: "pdf-export" | "test";
	jobId?: string;
	songbookId?: string;
	status?: string;
};

const FALLBACK: PushPayload = {
	title: "BandBro",
	body: "",
	tag: "bandbro",
	url: "/app/",
};

/** A notification for a finished (or failed) setlist PDF export. */
export function pdfExportPush(job: {
	id: string;
	songbookId: string;
	status: "done" | "failed";
	filename: string | null;
	songCount: number | null;
	error?: string | null;
}): PushPayload {
	const name = job.filename?.replace(/\.pdf$/i, "") ?? "Setlist";
	const songs =
		job.songCount === null || job.songCount === undefined
			? ""
			: `${job.songCount} song${job.songCount === 1 ? "" : "s"} · `;

	return {
		title: job.status === "done" ? "Setlist PDF ready" : "Setlist PDF failed",
		body:
			job.status === "done"
				? `${name} — ${songs}tap to download.`
				: (job.error ?? `${name} could not be rendered.`),
		tag: `pdf-export:${job.id}`,
		// Carries the job id so the click lands on a download button even on a device
		// that didn't start the export — push reaches every device the account has.
		url: `/app/setlists/${job.songbookId}?export=${job.id}`,
		data: {
			kind: "pdf-export",
			jobId: job.id,
			songbookId: job.songbookId,
			status: job.status,
		},
	};
}

/** The "does this actually work?" notification sent from Preferences. */
export function testPush(): PushPayload {
	return {
		title: "Notifications are on",
		body: "BandBro will tell you when a setlist PDF is ready.",
		tag: "bandbro:test",
		url: "/app/preferences",
		data: { kind: "test" },
	};
}

/**
 * Read a payload as delivered. Never throws and never returns a blank notification —
 * see the note on silent pushes above.
 */
export function parsePushPayload(raw: string | null | undefined): PushPayload {
	if (!raw) return FALLBACK;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		// Not JSON — an older or foreign sender. Show the text; it's better than nothing.
		return { ...FALLBACK, body: raw };
	}
	if (!parsed || typeof parsed !== "object") return FALLBACK;

	const value = parsed as Partial<PushPayload>;
	return {
		title: str(value.title) ?? FALLBACK.title,
		body: str(value.body) ?? FALLBACK.body,
		tag: str(value.tag) ?? FALLBACK.tag,
		// Only same-origin app paths: the URL is opened by the worker without a user
		// gesture, so an absolute one from a spoofed sender would be an open redirect.
		url: appPath(value.url) ?? FALLBACK.url,
		data:
			value.data && typeof value.data === "object"
				? (value.data as PushData)
				: undefined,
	};
}

function str(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** `/app/...` only — rejects absolute URLs, protocol-relative `//host`, and anything else. */
function appPath(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	if (!value.startsWith("/app") || value.startsWith("//")) return undefined;
	return value;
}
