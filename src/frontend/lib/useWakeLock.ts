import { useEffect } from "react";

/**
 * Keep the screen awake while a chart is on it (CLAUDE.md §D27).
 *
 * The whole premise of Live mode and the fan view is a phone or tablet propped on a stand
 * being *read*, not touched — which is exactly the condition every OS treats as idle. A
 * screen that locks four bars into a song is the most visible failure the app had.
 *
 * Two things make this more than one API call:
 *
 * - **The lock dies whenever the page is hidden** and is not restored automatically. A
 *   notification, a glance at another app, or the OS dimming the screen releases it, so
 *   it has to be re-requested on `visibilitychange` — otherwise it works once and then
 *   quietly stops, which is worse than not having it.
 * - **`request()` rejects, routinely.** Low battery, a background tab, or an iOS Safari
 *   below 16.4 where the API simply doesn't exist. None of that is exceptional and none
 *   of it should reach the player, so every failure is swallowed: the screen dims, as it
 *   did before.
 */
export function useWakeLock(enabled = true): void {
	useEffect(() => {
		if (!enabled) return;
		if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

		let sentinel: WakeLockSentinel | null = null;
		let released = false;

		const acquire = async () => {
			if (released || document.visibilityState !== "visible") return;
			try {
				sentinel = await navigator.wakeLock.request("screen");
			} catch {
				// Denied (battery saver, background tab) — nothing to tell the player.
			}
		};

		const onVisible = () => {
			if (document.visibilityState === "visible") void acquire();
		};

		void acquire();
		document.addEventListener("visibilitychange", onVisible);

		return () => {
			released = true;
			document.removeEventListener("visibilitychange", onVisible);
			// Release explicitly: leaving it held after leaving Live mode would keep a
			// phone awake in someone's pocket for the rest of the night.
			void sentinel?.release().catch(() => {});
			sentinel = null;
		};
	}, [enabled]);
}
