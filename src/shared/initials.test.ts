import { describe, expect, test } from "bun:test";
import { initials } from "./initials";

describe("initials", () => {
	test("takes the first and last word", () => {
		expect(initials("Tomas Bedrnik")).toBe("TB");
		expect(initials("Jan Amos Komensky")).toBe("JK");
	});

	test("keeps diacritics, uppercased", () => {
		expect(initials("Šárka Černá")).toBe("ŠČ");
	});

	test("a single word gives its first two letters", () => {
		expect(initials("bandbro")).toBe("BA");
		expect(initials("x")).toBe("X");
	});

	test("extra whitespace doesn't produce blanks", () => {
		expect(initials("  Tomas   Bedrnik  ")).toBe("TB");
	});

	// The circle is always drawn, so this has to return something printable.
	test("an unusable name still yields a character", () => {
		expect(initials("")).toBe("?");
		expect(initials("   ")).toBe("?");
		expect(initials(null)).toBe("?");
		expect(initials(undefined)).toBe("?");
	});

	test("never exceeds two characters", () => {
		for (const name of ["Tomas Bedrnik", "bandbro", "A B C D E"]) {
			expect([...initials(name)].length).toBeLessThanOrEqual(2);
		}
	});
});
