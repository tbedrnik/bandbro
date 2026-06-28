import { describe, expect, test } from "bun:test";
import { slugify } from "./slug";

describe("slugify", () => {
	test("transliterates Czech diacritics instead of dropping them", () => {
		expect(slugify("Žluťoučký kůň")).toBe("zlutoucky-kun");
		expect(slugify("Holešovická")).toBe("holesovicka");
		expect(slugify("Příliš žluťoučký")).toBe("prilis-zlutoucky");
		expect(slugify("ýřčš")).toBe("yrcs");
	});

	test("lowercases and hyphenates", () => {
		expect(slugify("House of the Rising Sun")).toBe("house-of-the-rising-sun");
		expect(slugify("  Spaces  &  symbols!  ")).toBe("spaces-symbols");
	});

	test("collapses runs and trims separators", () => {
		expect(slugify("a---b__c")).toBe("a-b-c");
		expect(slugify("!!!")).toBe("");
	});
});
