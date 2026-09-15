import { useCallback, useEffect, useRef } from "react";

/**
 * Advance a set without touching the screen (CLAUDE.md §D27).
 *
 * The design brief asks for exactly this — "big tap targets; swipe to advance", "operated
 * mid-song with one hand or a foot pedal" — and none of it existed.
 *
 * **Keys are the pedal.** A Bluetooth page-turner is not a special device to integrate: it
 * is a keyboard that sends arrows, page up/down, or space. Handling those keys handles
 * every pedal on the market, with no pairing UI and nothing to configure.
 *
 * Deliberately ignores a key pressed while typing, and while a dialog or drawer has focus
 * — Escape closing a sheet must not also skip a song.
 */
export function useSongKeys({
	onPrev,
	onNext,
	enabled = true,
}: {
	onPrev: () => void;
	onNext: () => void;
	enabled?: boolean;
}): void {
	useEffect(() => {
		if (!enabled) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const el = e.target as HTMLElement | null;
			// A search box in the setlist panel is a keyboard target in its own right.
			if (
				el?.isContentEditable ||
				["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName ?? "")
			) {
				return;
			}
			switch (e.key) {
				case "ArrowRight":
				case "ArrowDown":
				case "PageDown":
				case " ":
					e.preventDefault();
					onNext();
					break;
				case "ArrowLeft":
				case "ArrowUp":
				case "PageUp":
					e.preventDefault();
					onPrev();
					break;
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onPrev, onNext, enabled]);
}

/** How far a finger must travel horizontally, and how straight, to count as a swipe. */
const SWIPE_MIN_X = 60;
const SWIPE_MAX_Y = 45;

/**
 * What a completed drag meant, or null for "not a swipe". Pure, because the rule that
 * matters — don't fight scrolling — is worth pinning without a DOM.
 */
export function swipeIntent(dx: number, dy: number): "prev" | "next" | null {
	if (Math.abs(dx) < SWIPE_MIN_X || Math.abs(dy) > SWIPE_MAX_Y) return null;
	return dx < 0 ? "next" : "prev";
}

/**
 * Swipe left/right to change song, as touch handlers to spread onto the chart element.
 *
 * The vertical tolerance is what keeps this from fighting the one gesture the chart
 * already owns: scrolling a long song. A drag that travels further up or down than across
 * is a scroll, and is left alone.
 */
export function useSongSwipe({
	onPrev,
	onNext,
	enabled = true,
}: {
	onPrev: () => void;
	onNext: () => void;
	enabled?: boolean;
}): Pick<React.DOMAttributes<HTMLElement>, "onTouchStart" | "onTouchEnd"> {
	// A ref, not closure variables: a render between touchstart and touchend would
	// otherwise throw the gesture's origin away and the swipe would never complete.
	const start = useRef<{ x: number; y: number } | null>(null);

	const onTouchStart = useCallback((e: React.TouchEvent) => {
		if (e.touches.length !== 1) {
			start.current = null; // a pinch-zoom is not a swipe
			return;
		}
		const t = e.touches[0];
		start.current = t ? { x: t.clientX, y: t.clientY } : null;
	}, []);

	const onTouchEnd = useCallback(
		(e: React.TouchEvent) => {
			const from = start.current;
			start.current = null;
			if (!from) return;
			const t = e.changedTouches[0];
			if (!t) return;
			const intent = swipeIntent(t.clientX - from.x, t.clientY - from.y);
			if (intent === "next") onNext();
			else if (intent === "prev") onPrev();
		},
		[onNext, onPrev],
	);

	return enabled ? { onTouchStart, onTouchEnd } : {};
}
