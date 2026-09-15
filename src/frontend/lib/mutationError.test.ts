import { describe, expect, test } from "bun:test";
import { errorStatus, mutationErrorMessage } from "./mutationError";

describe("errorStatus", () => {
	test("reads the status Eden puts on the error", () => {
		expect(errorStatus({ status: 403 })).toBe(403);
	});

	test("is undefined rather than throwing for anything else", () => {
		expect(errorStatus(null)).toBeUndefined();
		expect(errorStatus(undefined)).toBeUndefined();
		expect(errorStatus(new Error("network"))).toBeUndefined();
	});
});

describe("mutationErrorMessage", () => {
	test("names the permission case, which is the one a band hits", () => {
		expect(mutationErrorMessage({ status: 403 })).toMatch(/permission/i);
	});

	test("a missing thing tells you to reload rather than retry", () => {
		expect(mutationErrorMessage({ status: 404 })).toMatch(/reload/i);
	});

	test("an unknown failure blames the connection, not the user", () => {
		expect(mutationErrorMessage(new Error("boom"))).toMatch(/connection/i);
	});

	test("the subject is what didn't happen", () => {
		expect(mutationErrorMessage({ status: 500 }, "The song")).toStartWith(
			"The song wasn't saved",
		);
	});

	test("every mapped status produces a sentence, never an empty string", () => {
		for (const status of [400, 401, 403, 404, 409, 413, 429, 500, 502, 503]) {
			expect(mutationErrorMessage({ status }).length).toBeGreaterThan(10);
		}
	});
});
