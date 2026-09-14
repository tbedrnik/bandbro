/**
 * Lineups — the performing identities inside a band (CLAUDE.md §D25).
 *
 * The rule every screen follows: a band with only its default lineup shows no lineup UI
 * at all. Someone who only ever plays under one name should not learn the concept
 * exists. Pure, so that rule is one testable function rather than a condition repeated
 * on six screens.
 */

export type LineupLite = {
	id: string;
	name: string;
	isDefault: boolean;
	organizationId: string;
};

/** Lineups of one band, preserving list order (the API returns default first). */
export function lineupsOf<T extends { organizationId: string }>(
	lineups: T[] | undefined,
	organizationId: string | null | undefined,
): T[] {
	if (!lineups || !organizationId) return [];
	return lineups.filter((l) => l.organizationId === organizationId);
}

/**
 * Whether this band performs under more than one name — the switch that reveals every
 * lineup control on every screen.
 */
export function hasMultipleLineups<T extends { organizationId: string }>(
	lineups: T[] | undefined,
	organizationId: string | null | undefined,
): boolean {
	return lineupsOf(lineups, organizationId).length > 1;
}

/**
 * What to call a set's performing identity. A default lineup is named after its band
 * and carries no extra meaning, so it stays anonymous — printing "Banda · Banda" on
 * every card would be noise.
 */
export function lineupLabel(
	lineup: { name: string; isDefault: boolean } | null | undefined,
	fallback?: string | null,
): string {
	if (!lineup) return fallback ?? "";
	if (lineup.isDefault) return fallback ?? lineup.name;
	return lineup.name;
}

/** The default lineup of a band, which is where a new setlist lands by default. */
export function defaultLineupOf<
	T extends { organizationId: string; isDefault: boolean },
>(
	lineups: T[] | undefined,
	organizationId: string | null | undefined,
): T | undefined {
	return lineupsOf(lineups, organizationId).find((l) => l.isDefault);
}

/**
 * How a lineup reads in a picker that spans every band: "Banda", "Banda · Duo Tomi
 * Kohy". The band always leads, because that is what the player recognises; the lineup
 * only earns its half of the label when it is not the band's default.
 */
export function lineupOptionLabel(
	lineup: { name: string; isDefault: boolean },
	bandName: string,
): string {
	return lineup.isDefault ? bandName : `${bandName} \u00b7 ${lineup.name}`;
}
