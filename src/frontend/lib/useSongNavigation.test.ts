import { describe, expect, test } from "bun:test";
import { swipeIntent } from "./useSongNavigation";

/**
 * The gesture rule, extracted so it can be tested without a DOM: the whole point is that
 * it must not fight scrolling, which is the one gesture the chart already owns.
 */
describe("swipeIntent", () => {
	test("a clear leftward drag is 'next'", () => {
		expect(swipeIntent(-120, 5)).toBe("next");
	});

	test("a clear rightward drag is 'prev'", () => {
		expect(swipeIntent(120, -5)).toBe("prev");
	});

	test("a short drag is nothing — a tap wobble must not change song", () => {
		expect(swipeIntent(-20, 0)).toBeNull();
		expect(swipeIntent(59, 0)).toBeNull();
	});

	test("a drag that travels more vertically is a scroll, and is left alone", () => {
		// Reading a long song means dragging up and down through it constantly; any
		// horizontal drift in that gesture must not skip a song.
		expect(swipeIntent(-100, 80)).toBeNull();
		expect(swipeIntent(200, -300)).toBeNull();
	});

	test("the vertical tolerance is a limit, not a ratio", () => {
		expect(swipeIntent(-70, 44)).toBe("next");
		expect(swipeIntent(-70, 46)).toBeNull();
	});
});
