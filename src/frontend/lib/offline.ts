import { useCallback, useEffect, useState } from "react";

/**
 * Per-setlist offline cache (CLAUDE.md §D7). v1 is read-only offline: "Download for
 * offline" snapshots the resolved setlist payload (songs + charts) into localStorage,
 * Live mode reads from that snapshot whenever the network is unavailable, and
 * `/app/offline` lists what is on the device. The service worker (src/frontend/sw.js)
 * separately precaches the app shell so the installed app boots with no signal.
 *
 * **Why localStorage and not IndexedDB.** The payload is ChordPro text: a 60-song set is
 * on the order of 200 KB, against a ~5 MB per-origin localStorage budget, so capacity is
 * not the constraint. What *is* load-bearing is that reads are synchronous — Live mode
 * feeds `getOfflineSetlist` straight into react-query's `initialData` and the setlist
 * screen seeds `useState` from `isDownloaded`, both of which run during render. Moving to
 * IndexedDB would make every one of those call sites async for no capacity we need.
 * `downloadSetlist` returns whether the write survived, so a quota failure is visible
 * rather than silently pretending the set is on the device.
 */

const PREFIX = "bandbro:offline:setlist:";
const META = "bandbro:offline:meta";

export type OfflineSetlistMeta = {
	id: string;
	title: string;
	songCount: number;
	/** Epoch ms of the download, so the shelf can say how fresh a set is. */
	downloadedAt: number;
};

/** The shape of a stored payload that this module reads for its listing. */
type StoredSetlist = {
	title?: string | null;
	songs?: unknown[] | null;
};

function storage(): Storage | null {
	try {
		return typeof localStorage === "undefined" ? null : localStorage;
	} catch {
		// Safari in private mode, or a browser configured to block site data.
		return null;
	}
}

function readMetaIndex(): Record<string, OfflineSetlistMeta> {
	const store = storage();
	if (!store) return {};
	try {
		const raw = store.getItem(META);
		const parsed = raw ? JSON.parse(raw) : null;
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

function writeMetaIndex(index: Record<string, OfflineSetlistMeta>) {
	const store = storage();
	if (!store) return;
	try {
		store.setItem(META, JSON.stringify(index));
	} catch {
		// The listing self-heals from the payloads, so a lost index is survivable.
	}
}

/** Derive a set's listing entry from its payload — the fallback when the index is gone. */
function deriveMeta(
	id: string,
	payload: unknown,
	downloadedAt: number,
): OfflineSetlistMeta {
	const setlist = (payload ?? {}) as StoredSetlist;
	return {
		id,
		title: setlist.title || "Untitled setlist",
		songCount: Array.isArray(setlist.songs) ? setlist.songs.length : 0,
		downloadedAt,
	};
}

export function downloadSetlist(id: string, payload: unknown): boolean {
	const store = storage();
	if (!store) return false;
	try {
		store.setItem(PREFIX + id, JSON.stringify(payload));
	} catch {
		// Quota exceeded, or storage unavailable.
		return false;
	}
	writeMetaIndex({
		...readMetaIndex(),
		[id]: deriveMeta(id, payload, Date.now()),
	});
	notify();
	return true;
}

export function getOfflineSetlist<T = unknown>(id: string): T | null {
	const store = storage();
	if (!store) return null;
	try {
		const raw = store.getItem(PREFIX + id);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

export function isDownloaded(id: string): boolean {
	const store = storage();
	if (!store) return false;
	try {
		return store.getItem(PREFIX + id) !== null;
	} catch {
		return false;
	}
}

export function removeOfflineSetlist(id: string) {
	const store = storage();
	if (!store) return;
	try {
		store.removeItem(PREFIX + id);
	} catch {
		// ignore
	}
	const index = readMetaIndex();
	delete index[id];
	writeMetaIndex(index);
	notify();
}

/**
 * Every setlist currently on this device, newest download first.
 *
 * Driven by the *payload* keys rather than the index, so it stays true even if the index
 * is stale, and so sets downloaded before the index existed still appear (their metadata
 * is derived from the payload and folded back into the index on read).
 */
export function listOfflineSetlists(): OfflineSetlistMeta[] {
	const store = storage();
	if (!store) return [];
	const index = readMetaIndex();
	const out: OfflineSetlistMeta[] = [];
	let repaired = false;
	try {
		for (let i = 0; i < store.length; i++) {
			const key = store.key(i);
			if (!key?.startsWith(PREFIX)) continue;
			const id = key.slice(PREFIX.length);
			const known = index[id];
			if (known) {
				out.push(known);
				continue;
			}
			// Downloaded before the index existed (or the index was lost) — rebuild it.
			const meta = deriveMeta(id, getOfflineSetlist(id), 0);
			index[id] = meta;
			out.push(meta);
			repaired = true;
		}
	} catch {
		return out;
	}
	// Drop index entries whose payload is gone, so the two can't drift apart.
	for (const id of Object.keys(index)) {
		if (!out.some((m) => m.id === id)) {
			delete index[id];
			repaired = true;
		}
	}
	if (repaired) writeMetaIndex(index);
	return out.sort((a, b) => b.downloadedAt - a.downloadedAt);
}

/** Same-tab change notification — `storage` events only fire in *other* tabs. */
const listeners = new Set<() => void>();
function notify() {
	for (const fn of listeners) fn();
}

/** Reactive view of {@link listOfflineSetlists}, kept in step with downloads/removals. */
export function useOfflineSetlists(): OfflineSetlistMeta[] {
	const [items, setItems] = useState<OfflineSetlistMeta[]>([]);
	const refresh = useCallback(() => setItems(listOfflineSetlists()), []);
	useEffect(() => {
		refresh();
		listeners.add(refresh);
		window.addEventListener("storage", refresh);
		return () => {
			listeners.delete(refresh);
			window.removeEventListener("storage", refresh);
		};
	}, [refresh]);
	return items;
}

/** Reactive online/offline flag. */
export function useOnline(): boolean {
	const [online, setOnline] = useState(
		typeof navigator === "undefined" ? true : navigator.onLine,
	);
	useEffect(() => {
		const on = () => setOnline(true);
		const off = () => setOnline(false);
		window.addEventListener("online", on);
		window.addEventListener("offline", off);
		return () => {
			window.removeEventListener("online", on);
			window.removeEventListener("offline", off);
		};
	}, []);
	return online;
}
