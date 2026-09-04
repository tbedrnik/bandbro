import { describe, expect, test } from "bun:test";
import {
	INVITE_CODE_ALPHABET,
	INVITE_CODE_LENGTH,
	inviteStatus,
	invitesLeft,
	isInviteCodeFormat,
	normalizeInviteCode,
	randomInviteCode,
} from "./bandInvite";

const NEVER = { expiresAt: null, revokedAt: null };

describe("randomInviteCode", () => {
	test("is the declared length, from the declared alphabet", () => {
		for (let i = 0; i < 200; i++) {
			const code = randomInviteCode();
			expect(code).toHaveLength(INVITE_CODE_LENGTH);
			expect(isInviteCodeFormat(code)).toBe(true);
		}
	});

	test("omits the characters that are misread aloud", () => {
		expect(INVITE_CODE_ALPHABET).not.toContain("0");
		expect(INVITE_CODE_ALPHABET).not.toContain("O");
		expect(INVITE_CODE_ALPHABET).not.toContain("1");
		expect(INVITE_CODE_ALPHABET).not.toContain("I");
	});

	test("does not repeat itself over a batch", () => {
		const codes = new Set(
			Array.from({ length: 500 }, () => randomInviteCode()),
		);
		expect(codes.size).toBe(500);
	});
});

describe("normalizeInviteCode", () => {
	test("uppercases and drops separators, so a lowercased URL round-trips", () => {
		expect(normalizeInviteCode("q7k-mn2-9xz4")).toBe("Q7KMN29XZ4");
		expect(normalizeInviteCode(" q7kmn29xz4 ")).toBe("Q7KMN29XZ4");
	});

	test("truncates to the code length", () => {
		expect(normalizeInviteCode("Q7KMN29XZ4EXTRA")).toBe("Q7KMN29XZ4");
	});
});

describe("isInviteCodeFormat", () => {
	test("rejects wrong lengths and out-of-alphabet characters", () => {
		expect(isInviteCodeFormat("Q7KMN29XZ4")).toBe(true);
		expect(isInviteCodeFormat("Q7KMN29XZ")).toBe(false);
		expect(isInviteCodeFormat("Q7KMN29XZ40")).toBe(false);
		expect(isInviteCodeFormat("Q7KMN29XZ0")).toBe(false);
		expect(isInviteCodeFormat("q7kmn29xz4")).toBe(false);
	});
});

describe("inviteStatus", () => {
	const now = new Date("2026-09-04T12:00:00Z");

	test("a fresh unlimited link is active", () => {
		expect(inviteStatus({ ...NEVER, maxUses: null, useCount: 12 }, now)).toBe(
			"active",
		);
	});

	test("expires on the stroke of expiresAt", () => {
		const at = (iso: string) =>
			inviteStatus(
				{ expiresAt: iso, revokedAt: null, maxUses: null, useCount: 0 },
				now,
			);
		expect(at("2026-09-04T12:00:01Z")).toBe("active");
		expect(at("2026-09-04T12:00:00Z")).toBe("expired");
		expect(at("2026-09-03T12:00:00Z")).toBe("expired");
	});

	test("a single-use link is exhausted by its one join", () => {
		expect(inviteStatus({ ...NEVER, maxUses: 1, useCount: 0 }, now)).toBe(
			"active",
		);
		expect(inviteStatus({ ...NEVER, maxUses: 1, useCount: 1 }, now)).toBe(
			"exhausted",
		);
	});

	test("revoked outranks expired and exhausted", () => {
		expect(
			inviteStatus(
				{
					expiresAt: "2020-01-01T00:00:00Z",
					revokedAt: "2026-09-01T00:00:00Z",
					maxUses: 1,
					useCount: 1,
				},
				now,
			),
		).toBe("revoked");
	});

	test("takes Date objects as they come out of Prisma", () => {
		expect(
			inviteStatus(
				{
					expiresAt: new Date("2026-09-05T00:00:00Z"),
					revokedAt: null,
					maxUses: 5,
					useCount: 5,
				},
				now,
			),
		).toBe("exhausted");
	});
});

describe("invitesLeft", () => {
	test("null for unlimited links", () => {
		expect(invitesLeft({ ...NEVER, maxUses: null, useCount: 3 })).toBeNull();
	});

	test("never goes negative", () => {
		expect(invitesLeft({ ...NEVER, maxUses: 3, useCount: 1 })).toBe(2);
		expect(invitesLeft({ ...NEVER, maxUses: 3, useCount: 4 })).toBe(0);
	});
});
