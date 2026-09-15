/**
 * Dates the way the reader's own locale writes them (CLAUDE.md §D27).
 *
 * The app hand-rolled English relative strings — "today", "yesterday", "3 days ago" — in
 * three places, right next to `toLocaleDateString()` calls that *were* locale-aware. So a
 * Czech band got a Czech date on one line and an English age on the next. `Intl` does this
 * properly in every locale the browser knows, including the plural rules that make
 * "3 days" different from "1 day" in Czech and most of Europe.
 *
 * `locale` is left undefined by default, which means "whatever this browser is set to" —
 * the same rule every other `Intl` call in the app follows.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A short, human age: "just now", "5 min ago", "yesterday", "3 days ago", and an absolute
 * date once it's old enough that the relative form stops meaning anything.
 */
export function formatAge(
	at: number,
	now = Date.now(),
	locale?: string,
): string {
	if (!at) return justNow(locale);
	const elapsed = now - at;
	// A clock that's behind the timestamp (device time, a server write) reads as "now"
	// rather than as the future.
	if (elapsed < MINUTE) return justNow(locale);

	const rtf = relative(locale);
	if (elapsed < HOUR) {
		return rtf.format(-Math.floor(elapsed / MINUTE), "minute");
	}
	if (elapsed < DAY) return rtf.format(-Math.floor(elapsed / HOUR), "hour");

	const days = Math.floor(elapsed / DAY);
	if (days < 30) return rtf.format(-days, "day");
	return formatDate(at, locale);
}

/** A calendar date: "14 Sept 2026" / "14. 9. 2026", per the reader's locale. */
export function formatDate(
	at: number | string | Date,
	locale?: string,
): string {
	const date = at instanceof Date ? at : new Date(at);
	if (Number.isNaN(date.getTime())) return "";
	return new Intl.DateTimeFormat(locale, {
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(date);
}

function relative(locale?: string): Intl.RelativeTimeFormat {
	// `numeric: "auto"` is what turns -1 day into "yesterday" rather than "1 day ago",
	// in whichever language that idiom exists.
	return new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
}

function justNow(locale?: string): string {
	return relative(locale).format(0, "second");
}
