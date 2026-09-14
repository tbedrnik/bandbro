/**
 * Is this device's downloaded copy of a setlist still the setlist? (CLAUDE.md §D7.)
 *
 * `Songbook.updatedAt` is not enough on its own: editing a chart touches the `chart`
 * row, not the songbook's, so a set whose songs were all rewritten still looks untouched
 * from the songbook. The fingerprint therefore covers what a player would actually
 * notice has gone stale — the title, which songs are in the set, the order they are in,
 * and when each chart was last edited.
 *
 * Pure and string-valued so the comparison is one `===` at the call site, and so it can
 * be computed identically for the stored snapshot and the fresh server response — which
 * are the same JSON shape, `updatedAt` included.
 */

type FingerprintEntry = {
	chartId?: string | null;
	chart?: { updatedAt?: string | Date | null } | null;
};

export type FingerprintableSetlist =
	| {
			title?: string | null;
			songs?: FingerprintEntry[] | null;
	  }
	| null
	| undefined;

function stamp(value: string | Date | null | undefined): string {
	if (!value) return "";
	return value instanceof Date ? value.toISOString() : String(value);
}

export function setlistFingerprint(setlist: FingerprintableSetlist): string {
	if (!setlist) return "";
	const entries = Array.isArray(setlist.songs) ? setlist.songs : [];
	return [
		setlist.title ?? "",
		...entries.map((e) => `${e?.chartId ?? ""}@${stamp(e?.chart?.updatedAt)}`),
	].join("|");
}

/**
 * Whether the stored copy differs from what the server just returned. Unknown answers
 * (nothing stored, nothing fetched) are deliberately *not* "stale": there is nothing to
 * warn a player about, and crying stale over a failed fetch at a gig is worse than
 * silence.
 */
export function isSnapshotStale(
	stored: FingerprintableSetlist,
	fresh: FingerprintableSetlist,
): boolean {
	if (!stored || !fresh) return false;
	return setlistFingerprint(stored) !== setlistFingerprint(fresh);
}
