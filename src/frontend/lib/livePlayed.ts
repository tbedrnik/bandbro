import { useCallback, useRef, useState } from "react";

/**
 * Which songs of tonight's setlist have already been played — per device, per setlist.
 *
 * A set is rarely performed straight down the list: songs get skipped, pulled forward, or
 * repeated by request, and ten songs in nobody can remember what's already been done. So
 * Live mode keeps a played mark per song, shown in the setlist panel and togglable there
 * and from the peek bar.
 *
 * Per *device*, like the display prefs (CLAUDE.md §D12) and the remembered scope (§D14),
 * and for the same reason: this is one player's view of the evening, not a property of the
 * band's setlist. It is also deliberately not synced to bandmates — two players skipping a
 * song for different reasons is normal, and a shared list would need a conflict story that
 * a gig has no time for.
 *
 * Marks are keyed by **chart**, not by the setlist row: editing a set rewrites its rows, and
 * losing the evening's marks because someone added a song at the interval would be worse
 * than the one case it costs us (the same chart twice in one set shares a mark — if you
 * played it, you played it).
 */

/** How long a song has to be on screen before it counts as played. */
export const AUTO_MARK_MS = 60_000;

export type PlayedSnapshot = {
	/** Chart keys, per `playedKey`. */
	ids: string[];
	/** When the last mark was made — what the resume prompt reports. */
	updatedAt: number;
};

/** The bits of a setlist entry the key is derived from; structurally typed so both the
 *  API payload and an offline snapshot of it satisfy it. */
type Entry = { chartId?: string | null; id?: string | null } | null | undefined;

const storageKey = (setlistId: string) => `bandbro:live:played:${setlistId}`;

/**
 * Stable identity of a song within a set. Falls back to the row id and then to the
 * position, so a payload missing either still marks *something* rather than throwing.
 */
export function playedKey(entry: Entry, index: number): string {
	return entry?.chartId ?? entry?.id ?? `#${index}`;
}

export function readPlayed(setlistId: string): PlayedSnapshot | null {
	if (typeof localStorage === "undefined") return null;
	try {
		const raw = localStorage.getItem(storageKey(setlistId));
		if (!raw) return null;
		const saved = JSON.parse(raw) as Partial<PlayedSnapshot>;
		const ids = Array.isArray(saved.ids)
			? saved.ids.filter((id): id is string => typeof id === "string")
			: [];
		if (ids.length === 0) return null;
		return {
			ids,
			updatedAt: typeof saved.updatedAt === "number" ? saved.updatedAt : 0,
		};
	} catch {
		return null;
	}
}

/** Persists the marks. An empty set removes the key, so "nothing stored" and "nothing
 *  played" are the same state — which is what keeps the resume prompt from appearing
 *  over an evening nobody started. */
export function writePlayed(setlistId: string, ids: readonly string[]) {
	if (typeof localStorage === "undefined") return;
	try {
		if (ids.length === 0) {
			localStorage.removeItem(storageKey(setlistId));
			return;
		}
		const snapshot: PlayedSnapshot = { ids: [...ids], updatedAt: Date.now() };
		localStorage.setItem(storageKey(setlistId), JSON.stringify(snapshot));
	} catch {
		// Private mode / storage full: the marks still apply for this session.
	}
}

export function clearPlayed(setlistId: string) {
	writePlayed(setlistId, []);
}

/**
 * Age of a stored session, in the units that tell a player what they're looking at: the
 * question is "was that this evening's set, or last month's gig?", so minutes and hours
 * matter here in a way they don't on the offline shelf.
 */
export function formatPlayedAge(at: number, now = Date.now()): string {
	const minutes = Math.floor((now - at) / 60_000);
	if (!at || minutes < 0) return "just now";
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
	const days = Math.floor(hours / 24);
	if (days === 1) return "yesterday";
	if (days < 30) return `${days} days ago`;
	return new Date(at).toLocaleDateString();
}

/**
 * The played marks for one setlist, restored from the device.
 *
 * `resume` is non-null when there were marks on disk: Live mode asks once whether this is
 * the same evening (keep them) or a new gig (clear them) before anything is auto-marked.
 * We deliberately don't guess from the timestamp — a band that plays two sets an hour apart
 * and a band that opens last week's set both look the same from here.
 */
export function usePlayedSongs(setlistId: string) {
	const stored = useRef<PlayedSnapshot | null>(null);
	if (stored.current === null) stored.current = readPlayed(setlistId);

	const [played, setPlayed] = useState<ReadonlySet<string>>(
		() => new Set(stored.current?.ids ?? []),
	);
	const [resume, setResume] = useState<PlayedSnapshot | null>(stored.current);

	const commit = useCallback(
		(next: Set<string>) => {
			writePlayed(setlistId, [...next]);
			setPlayed(next);
		},
		[setlistId],
	);

	const toggle = useCallback(
		(key: string) => {
			setPlayed((prev) => {
				const next = new Set(prev);
				if (!next.delete(key)) next.add(key);
				writePlayed(setlistId, [...next]);
				return next;
			});
		},
		[setlistId],
	);

	const markPlayed = useCallback(
		(key: string) => {
			setPlayed((prev) => {
				if (prev.has(key)) return prev;
				const next = new Set(prev).add(key);
				writePlayed(setlistId, [...next]);
				return next;
			});
		},
		[setlistId],
	);

	/** "Same evening" — keep what's on disk and stop asking. */
	const keepResumed = useCallback(() => setResume(null), []);

	/** "New gig" — drop every mark, on disk and on screen. */
	const startFresh = useCallback(() => {
		commit(new Set());
		setResume(null);
	}, [commit]);

	return { played, toggle, markPlayed, resume, keepResumed, startFresh };
}
