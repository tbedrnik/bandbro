import { useCallback, useState } from "react";

/**
 * Live mode's per-device display preferences — text size, vertical rhythm, column count
 * and "fit to screen". These are a player's physical setup (an iPad on a stand at arm's
 * length vs. a phone on a mic clip), not a property of the song or the band, so they live
 * in localStorage on the device and are never shared with fans or bandmates.
 */
export type LiveDisplay = {
	/** Index into `TEXT_SCALES`. Ignored while `fit` is on. */
	textIdx: number;
	/** Index into `GAP_SCALES`. */
	gapIdx: number;
	columns: 1 | 2 | 3;
	/** Auto-size the text so the whole song lands on one screen. */
	fit: boolean;
};

/** Text-size multipliers for the A−/A+ stepper, applied to the base Live font sizes. */
export const TEXT_SCALES = [0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5];
/** Line/section gap multipliers, passed straight to <ChordSheet gap>. */
export const GAP_SCALES = [0.3, 0.5, 0.7, 0.85, 1, 1.2, 1.45];

/** Base font sizes at scale 1 — Live mode's chart is deliberately larger than Song View. */
export const LIVE_LYRIC_SIZE = 28;
export const LIVE_CHORD_SIZE = 20;

const DEFAULTS: LiveDisplay = {
	textIdx: TEXT_SCALES.indexOf(1),
	gapIdx: GAP_SCALES.indexOf(1),
	columns: 1,
	fit: false,
};

const KEY = "bandbro:live-display";

const clamp = (value: unknown, fallback: number, length: number) =>
	typeof value === "number" && Number.isInteger(value)
		? Math.min(length - 1, Math.max(0, value))
		: fallback;

function read(): LiveDisplay {
	if (typeof localStorage === "undefined") return DEFAULTS;
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return DEFAULTS;
		const saved = JSON.parse(raw) as Partial<LiveDisplay>;
		return {
			textIdx: clamp(saved.textIdx, DEFAULTS.textIdx, TEXT_SCALES.length),
			gapIdx: clamp(saved.gapIdx, DEFAULTS.gapIdx, GAP_SCALES.length),
			columns: saved.columns === 2 || saved.columns === 3 ? saved.columns : 1,
			fit: saved.fit === true,
		};
	} catch {
		return DEFAULTS;
	}
}

/** Live mode's display prefs, persisted per device. */
export function useLiveDisplay() {
	const [display, setDisplay] = useState<LiveDisplay>(read);

	const update = useCallback((patch: Partial<LiveDisplay>) => {
		setDisplay((prev) => {
			const next = { ...prev, ...patch };
			try {
				localStorage.setItem(KEY, JSON.stringify(next));
			} catch {
				// Private mode / storage full: the setting still applies for this session.
			}
			return next;
		});
	}, []);

	return [display, update] as const;
}
