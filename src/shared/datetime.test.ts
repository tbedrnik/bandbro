import { describe, expect, test } from "bun:test";
import { formatAge, formatDate } from "./datetime";

const NOW = Date.UTC(2026, 8, 14, 12, 0, 0);
const ago = (ms: number) => formatAge(NOW - ms, NOW, "en-GB");

describe("formatAge", () => {
	test("very recent is 'now', not a negative count", () => {
		expect(ago(0)).toMatch(/now/i);
		expect(ago(30_000)).toMatch(/now/i);
	});

	test("a clock running behind doesn't produce a time in the future", () => {
		// Device clocks drift and server timestamps arrive from elsewhere.
		expect(formatAge(NOW + 60_000, NOW, "en-GB")).toMatch(/now/i);
	});

	test("minutes, hours and days", () => {
		expect(ago(5 * 60_000)).toBe("5 minutes ago");
		expect(ago(3 * 3_600_000)).toBe("3 hours ago");
		expect(ago(3 * 86_400_000)).toBe("3 days ago");
	});

	test("yesterday is idiomatic, not '1 day ago'", () => {
		expect(ago(26 * 3_600_000)).toBe("yesterday");
	});

	test("old enough and it becomes a date", () => {
		expect(ago(200 * 86_400_000)).toMatch(/2026|2025/);
	});

	test("a missing timestamp reads as now rather than 1970", () => {
		expect(formatAge(0, NOW, "en-GB")).toMatch(/now/i);
	});

	test("speaks the reader's language — the whole point", () => {
		// The hand-rolled English strings this replaces could not do this, and sat next
		// to locale-aware absolute dates.
		expect(formatAge(NOW - 3 * 86_400_000, NOW, "cs")).toContain("dny");
		expect(formatAge(NOW - 26 * 3_600_000, NOW, "cs")).toBe("včera");
	});
});

describe("formatDate", () => {
	test("formats per locale", () => {
		expect(formatDate(NOW, "en-GB")).toContain("2026");
		expect(formatDate(new Date(NOW), "cs")).toContain("2026");
	});

	test("accepts an ISO string, which is what the API sends", () => {
		expect(formatDate(new Date(NOW).toISOString(), "en-GB")).toContain("2026");
	});

	test("nonsense in, empty string out — never 'Invalid Date' on screen", () => {
		expect(formatDate("not a date", "en-GB")).toBe("");
	});
});
