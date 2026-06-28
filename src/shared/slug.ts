/**
 * URL-safe slug. Diacritics are transliterated to their base Latin letters rather
 * than dropped — so Czech (and other Latin-script) titles keep their characters:
 * "Žluťoučký kůň" → "zlutoucky-kun", "Holešovická" → "holesovicka".
 *
 * Works by Unicode-decomposing (NFKD) each accented letter into base + combining
 * mark, then stripping the combining marks (U+0300–U+036F).
 */
export function slugify(input: string): string {
	return input
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}
