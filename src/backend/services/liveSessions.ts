import { prisma } from "@backend/prisma";
import { parseChordproMeta } from "@shared/chordpro";
import { getMemberRole, HttpError } from "./scope";

/**
 * Live "fan" sessions — the public, read-only side of a gig (CLAUDE.md fan-experience
 * handoff). A band shares a 5-character `code`; fans open it without auth and auto-follow
 * the song the band is on. The band's client owns `currentSongIndex`; fans poll the public
 * read endpoint. Per-device view prefs (chords/size/theme/transpose) stay on the fan's phone
 * and never reach here.
 */

// Unambiguous alphabet (no 0/O/1/I) so a code is easy to read off a stage screen and type.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 5;

function randomCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
	let code = "";
	for (let i = 0; i < CODE_LENGTH; i++) {
		code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
	}
	return code;
}

async function uniqueCode(): Promise<string> {
	for (let attempt = 0; attempt < 10; attempt++) {
		const code = randomCode();
		const clash = await prisma.liveSession.findUnique({
			where: { code },
			select: { id: true },
		});
		if (!clash) return code;
	}
	throw new HttpError(500, "Could not allocate a session code.");
}

/**
 * "Watching" count — a lightweight, in-memory heartbeat (no DB). Each fan poll records its
 * client id; viewers seen within the window count as watching. Resets on restart, which is
 * fine for an ephemeral live count and keeps the public read cheap. Single-instance only.
 */
const WATCH_WINDOW_MS = 15_000;
const watchers = new Map<string, Map<string, number>>();

function recordWatcher(code: string, clientId: string): void {
	let seen = watchers.get(code);
	if (!seen) {
		seen = new Map();
		watchers.set(code, seen);
	}
	seen.set(clientId, Date.now());
}

function countWatching(code: string): number {
	const seen = watchers.get(code);
	if (!seen) return 0;
	const cutoff = Date.now() - WATCH_WINDOW_MS;
	let live = 0;
	for (const [id, ts] of seen) {
		if (ts >= cutoff) live += 1;
		else seen.delete(id);
	}
	return live;
}

/** Create (or reuse) the active fan session for a setlist. Any band member may share. */
export async function liveSessionCreate({
	userId,
	songbookId,
}: {
	userId: string;
	songbookId: string;
}) {
	const songbook = await prisma.songbook.findUnique({
		where: { id: songbookId },
		select: { id: true, organizationId: true },
	});
	if (!songbook) throw new HttpError(404, "Setlist not found.");

	const role = await getMemberRole(userId, songbook.organizationId);
	if (!role) {
		throw new HttpError(403, "You must be a member of this band to share it.");
	}

	const existing = await prisma.liveSession.findFirst({
		where: { songbookId, active: true },
		select: { code: true, currentSongIndex: true },
	});
	if (existing) {
		return { code: existing.code, currentSongIndex: existing.currentSongIndex };
	}

	const code = await uniqueCode();
	const created = await prisma.liveSession.create({
		data: { code, songbookId, organizationId: songbook.organizationId },
		select: { code: true, currentSongIndex: true },
	});
	return { code: created.code, currentSongIndex: created.currentSongIndex };
}

/** The band advances the set — push the new index so fans follow. Members only. */
export async function liveSessionSetCurrent({
	userId,
	code,
	currentSongIndex,
}: {
	userId: string;
	code: string;
	currentSongIndex: number;
}) {
	const session = await prisma.liveSession.findUnique({
		where: { code: code.toUpperCase() },
		select: { id: true, organizationId: true },
	});
	if (!session) throw new HttpError(404, "Session not found.");

	const role = await getMemberRole(userId, session.organizationId);
	if (!role) throw new HttpError(403, "You don't control this session.");

	await prisma.liveSession.update({
		where: { id: session.id },
		data: { currentSongIndex },
	});
	return { ok: true as const };
}

/**
 * Public, no-auth read of a fan session: the resolved setlist (read-only) plus the song the
 * band is currently on. Returns chart `content` so the fan client renders with the shared
 * ChordPro parser / transpose engine — identical chord sheets to the band's Live mode.
 */
export async function liveSessionPublicRead({
	code,
	clientId,
}: {
	code: string;
	clientId?: string;
}) {
	const normalized = code.toUpperCase();
	const session = await prisma.liveSession.findFirst({
		where: { code: normalized, active: true },
		include: {
			songbook: {
				include: {
					organization: { select: { name: true } },
					songs: {
						orderBy: { order: "asc" },
						include: {
							chart: {
								include: {
									song: {
										include: { credits: { include: { artist: true } } },
									},
								},
							},
						},
					},
				},
			},
		},
	});
	if (!session)
		throw new HttpError(404, "This session has ended or never existed.");

	if (clientId) recordWatcher(normalized, clientId);

	const songs = session.songbook.songs.map((entry) => {
		const chart = entry.chart;
		const meta = parseChordproMeta(chart.content);
		return {
			title: chart.song.name,
			artist: chart.song.credits.map((c) => c.artist.name).join(", "),
			key: chart.key ?? meta.key ?? "",
			capo: chart.capo ?? meta.capo ?? 0,
			content: chart.content,
		};
	});

	const count = songs.length;
	const currentSongIndex = Math.min(
		Math.max(session.currentSongIndex, 0),
		Math.max(count - 1, 0),
	);

	return {
		code: normalized,
		title: session.songbook.title,
		band: session.songbook.organization.name,
		currentSongIndex,
		songCount: count,
		watching: countWatching(normalized),
		songs,
	};
}
