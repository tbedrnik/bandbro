import { describe, expect, test } from "bun:test";
import { ADMIN_ROLES, canWrite, isAdmin, WRITE_ROLES } from "./permissions";

/**
 * These two functions gate every write in the app (`requireWrite` / `requireAdmin` in
 * services/scope.ts). They were untested; a regression here is a cross-tenant write.
 */

describe("canWrite", () => {
	test("admins and writers may write", () => {
		expect(canWrite("admin")).toBe(true);
		expect(canWrite("writer")).toBe(true);
	});

	test("readers may not", () => {
		expect(canWrite("reader")).toBe(false);
	});

	test("no role at all is never a write role", () => {
		expect(canWrite(null)).toBe(false);
		expect(canWrite(undefined)).toBe(false);
		expect(canWrite("")).toBe(false);
	});

	test("an unrecognised role is refused, not assumed", () => {
		// better-auth's own defaults (`owner`, `member`) predate the §D6 roles. Whatever
		// the display layer maps them to, the *guard* must not grant on a string it
		// doesn't know — fail closed.
		expect(canWrite("owner")).toBe(false);
		expect(canWrite("member")).toBe(false);
		expect(canWrite("Admin")).toBe(false); // case-sensitive by design
		expect(canWrite("admin ")).toBe(false);
	});
});

describe("isAdmin", () => {
	test("only admin", () => {
		expect(isAdmin("admin")).toBe(true);
		expect(isAdmin("writer")).toBe(false);
		expect(isAdmin("reader")).toBe(false);
	});

	test("absent and unknown roles fail closed", () => {
		expect(isAdmin(null)).toBe(false);
		expect(isAdmin(undefined)).toBe(false);
		expect(isAdmin("owner")).toBe(false);
	});
});

describe("the role sets themselves", () => {
	test("admin can do anything a writer can", () => {
		for (const role of WRITE_ROLES) expect(canWrite(role)).toBe(true);
		for (const role of ADMIN_ROLES) expect(canWrite(role)).toBe(true);
	});

	test("every admin role is a write role, but not the reverse", () => {
		expect(ADMIN_ROLES.every((r) => WRITE_ROLES.includes(r))).toBe(true);
		expect(WRITE_ROLES.every((r) => ADMIN_ROLES.includes(r))).toBe(false);
	});
});
