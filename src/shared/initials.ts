/**
 * Initials for an account avatar.
 *
 * Two letters, taken from the start of the first and last word — "Tomáš Bedrník" reads
 * as TB, not TO. Whatever comes back is meant to sit in a 36px circle, so length is
 * capped rather than trusted, and a name that yields nothing usable (whitespace, or an
 * emoji-only display name) falls back to a single letter rather than an empty circle.
 *
 * Shared because the landing page needs the same answer as the app — it renders the same
 * avatar from a cookie hint, and two different rules would show two different circles for
 * the same person.
 */
export function initials(name: string | null | undefined): string {
	const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
	if (!words.length) return "?";

	const letters =
		words.length === 1
			? // One word: its first two characters read better than one lonely letter
				// ("bandbro" → BA), which is also what an email-shaped name gives.
				[...words[0]].slice(0, 2)
			: [[...words[0]][0], [...words[words.length - 1]][0]];

	const joined = letters.filter(Boolean).join("").toUpperCase();
	// Spread by code point, so an accented or non-Latin letter isn't cut in half.
	return joined || "?";
}
