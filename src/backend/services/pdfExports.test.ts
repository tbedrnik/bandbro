import { describe, expect, test } from "bun:test";
import { exportsDirFor } from "./pdfExports";

describe("exportsDirFor", () => {
	test("writes beside the SQLite file, which on Railway is the volume", () => {
		expect(exportsDirFor("file:/data/production.db")).toBe("/data/exports");
	});

	test("handles a relative dev database", () => {
		expect(exportsDirFor("file:./dev.db")).toBe("./exports");
	});

	test("an explicit override wins", () => {
		expect(exportsDirFor("file:/data/production.db", "/mnt/pdfs")).toBe(
			"/mnt/pdfs",
		);
	});

	test("falls back locally when the datasource isn't a file URL", () => {
		// Guessing at a path for a non-SQLite datasource risks writing somewhere the
		// container can't, which would fail every export rather than just this one.
		expect(exportsDirFor(undefined)).toBe(".exports");
		expect(exportsDirFor("postgres://localhost/bandbro")).toBe(".exports");
	});
});
