import { describe, expect, test } from "bun:test";
import { parsePushPayload, pdfExportPush, testPush } from "./pushPayload";

const DONE = {
	id: "job1",
	songbookId: "set1",
	status: "done" as const,
	filename: "Summer tour.pdf",
	songCount: 12,
};

describe("pdfExportPush", () => {
	test("names the setlist and its size, without the file extension", () => {
		const push = pdfExportPush(DONE);
		expect(push.title).toBe("Setlist PDF ready");
		expect(push.body).toBe("Summer tour — 12 songs · tap to download.");
	});

	test("counts one song in the singular", () => {
		expect(pdfExportPush({ ...DONE, songCount: 1 }).body).toContain("1 song ·");
	});

	test("carries the job id in the URL, so the click works on any device", () => {
		expect(pdfExportPush(DONE).url).toBe("/app/setlists/set1?export=job1");
	});

	test("tags by job, so a retried export replaces rather than stacks", () => {
		expect(pdfExportPush(DONE).tag).toBe("pdf-export:job1");
		expect(pdfExportPush({ ...DONE, id: "job2" }).tag).not.toBe(
			pdfExportPush(DONE).tag,
		);
	});

	test("a failure reports the server's reason", () => {
		const push = pdfExportPush({
			...DONE,
			status: "failed",
			error: "The render timed out.",
		});
		expect(push.title).toBe("Setlist PDF failed");
		expect(push.body).toBe("The render timed out.");
	});

	test("a failure with no reason still says something useful", () => {
		const push = pdfExportPush({ ...DONE, status: "failed", error: null });
		expect(push.body).toBe("Summer tour could not be rendered.");
	});

	test("survives a job with no filename or count", () => {
		const push = pdfExportPush({ ...DONE, filename: null, songCount: null });
		expect(push.body).toBe("Setlist — tap to download.");
	});
});

describe("parsePushPayload", () => {
	test("round-trips what the server sends", () => {
		const sent = pdfExportPush(DONE);
		expect(parsePushPayload(JSON.stringify(sent))).toEqual(sent);
		const t = testPush();
		expect(parsePushPayload(JSON.stringify(t))).toEqual(t);
	});

	// A push service may wake the worker with no data at all, and a notification must
	// appear regardless — a silent push costs the origin its permission.
	test("an empty push still yields a showable notification", () => {
		for (const raw of [null, undefined, ""]) {
			const push = parsePushPayload(raw);
			expect(push.title).toBe("BandBro");
			expect(push.url).toBe("/app/");
		}
	});

	test("non-JSON is shown as the body rather than dropped", () => {
		expect(parsePushPayload("hello").body).toBe("hello");
	});

	test("a JSON non-object falls back", () => {
		expect(parsePushPayload("42").title).toBe("BandBro");
		expect(parsePushPayload("null").title).toBe("BandBro");
	});

	test("missing and empty fields fall back rather than showing blanks", () => {
		const push = parsePushPayload(JSON.stringify({ title: "", body: 7 }));
		expect(push.title).toBe("BandBro");
		expect(push.body).toBe("");
		expect(push.tag).toBe("bandbro");
	});

	// The worker opens this URL with no user gesture behind it, so a sender that isn't
	// us must not be able to steer the click off-origin.
	test("only same-origin /app paths survive", () => {
		const off = [
			"https://evil.example/app",
			"//evil.example/app",
			"/api/pdf-exports/x",
			"/",
			"javascript:alert(1)",
			42,
		];
		for (const url of off) {
			expect(parsePushPayload(JSON.stringify({ url })).url).toBe("/app/");
		}
		expect(
			parsePushPayload(JSON.stringify({ url: "/app/setlists/1" })).url,
		).toBe("/app/setlists/1");
	});
});
