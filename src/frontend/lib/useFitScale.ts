import {
	type RefObject,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

/**
 * Bounds of the automatic search, as multipliers of the base font sizes. The floor is a
 * legibility floor, not a fitting one: a song with a dozen sections and several tab staves
 * will not fit an iPad at any readable size, and shrinking it to 8px to technically "fit"
 * is worse than letting it scroll.
 */
export const FIT_MIN = 0.5;
export const FIT_MAX = 1.7;

/** log2((FIT_MAX − FIT_MIN) / 0.02) ≈ 6, plus a step of slack. */
const STEPS = 8;
const TOLERANCE = 0.02;

/**
 * "Fit to screen": the largest text scale at which the scroll container's content still
 * fits without scrolling.
 *
 * There's no way to compute this in closed form — the text reflows, so height isn't a
 * smooth function of font size — so we binary-search it against the real layout. Each
 * candidate is committed as state and measured in a *layout* effect, which React runs
 * (and re-runs, since the effect sets state) before the browser paints: the whole search
 * resolves inside one frame, so the user never sees the intermediate sizes. `resetKey`
 * bundles everything that changes the answer (the song, the gap, the column count) and
 * restarts the search; a ResizeObserver on the viewport covers rotation and split view.
 *
 * Returns 1 (i.e. "leave the size alone") while disabled.
 */
export function useFitScale({
	enabled,
	viewportRef,
	resetKey,
}: {
	enabled: boolean;
	viewportRef: RefObject<HTMLElement | null>;
	resetKey: string;
}) {
	const [scale, setScale] = useState(FIT_MAX);
	const [resizes, setResizes] = useState(0);
	const search = useRef({
		key: "",
		lo: FIT_MIN,
		hi: FIT_MAX,
		iter: 0,
		done: false,
	});
	const key = `${resetKey}|${resizes}`;

	useLayoutEffect(() => {
		if (!enabled) return;
		const viewport = viewportRef.current;
		if (!viewport) return;
		const state = search.current;

		if (state.key !== key) {
			// Start over from the top of the range, and only measure once the DOM actually
			// shows that size — otherwise the first probe would judge the previous scale.
			state.key = key;
			state.lo = FIT_MIN;
			state.hi = FIT_MAX;
			state.iter = 0;
			state.done = false;
			if (scale !== FIT_MAX) {
				setScale(FIT_MAX);
				return;
			}
		}
		if (state.done) return;

		if (viewport.scrollHeight <= viewport.clientHeight) state.lo = scale;
		else state.hi = scale;
		state.iter += 1;

		if (state.iter >= STEPS || state.hi - state.lo < TOLERANCE) {
			state.done = true;
			// Land on the largest size known to fit, not on the last one probed.
			if (scale !== state.lo) setScale(state.lo);
			return;
		}
		setScale((state.lo + state.hi) / 2);
	}, [enabled, scale, key, viewportRef]);

	useEffect(() => {
		if (!enabled) return;
		const viewport = viewportRef.current;
		if (!viewport || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => {
			setResizes((n) => n + 1);
		});
		observer.observe(viewport);
		return () => {
			observer.disconnect();
		};
	}, [enabled, viewportRef]);

	return enabled ? scale : 1;
}
