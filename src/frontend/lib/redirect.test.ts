import { describe, expect, test } from "bun:test";
import { safeRedirect } from "./redirect";

describe("safeRedirect", () => {
	test("keeps in-app paths, query and hash included", () => {
		expect(safeRedirect("/join/Q7KMN29XZ4")).toBe("/join/Q7KMN29XZ4");
		expect(safeRedirect("/library?scope=curated")).toBe(
			"/library?scope=curated",
		);
	});

	test("falls back when there is nothing to go back to", () => {
		expect(safeRedirect(undefined)).toBe("/");
		expect(safeRedirect("")).toBe("/");
		expect(safeRedirect(undefined, "/bands")).toBe("/bands");
	});

	test("refuses to leave the app", () => {
		expect(safeRedirect("https://evil.example/steal")).toBe("/");
		expect(safeRedirect("//evil.example/steal")).toBe("/");
		expect(safeRedirect("javascript:alert(1)")).toBe("/");
	});
});
