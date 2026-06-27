import { useEffect, useState } from "react";

/**
 * Per-playlist offline cache (CLAUDE.md §D7). v1 is read-only offline: "Download for
 * offline" snapshots the resolved setlist payload (songs + charts) into localStorage,
 * and Live mode reads from that snapshot whenever the network is unavailable. The
 * service worker (sw.js) separately precaches the app shell so /app boots offline.
 */

const PREFIX = "bandbro:offline:setlist:";

export function downloadSetlist(id: string, payload: unknown) {
	try {
		localStorage.setItem(PREFIX + id, JSON.stringify(payload));
	} catch {
		// storage full / unavailable — surfaced by isDownloaded staying false
	}
}

export function getOfflineSetlist<T = unknown>(id: string): T | null {
	try {
		const raw = localStorage.getItem(PREFIX + id);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

export function isDownloaded(id: string): boolean {
	try {
		return localStorage.getItem(PREFIX + id) !== null;
	} catch {
		return false;
	}
}

export function removeOfflineSetlist(id: string) {
	try {
		localStorage.removeItem(PREFIX + id);
	} catch {
		// ignore
	}
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
