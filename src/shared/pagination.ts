/**
 * How many rows a list endpoint hands back (CLAUDE.md §D27).
 *
 * `songsList` had no `take` at all, so the Library asked for a band's entire library on
 * every keystroke. These live in `src/shared` because the caller has to know the number
 * it asked for: a page that came back exactly full is the only signal that there is more
 * behind it, and a screen can only say so if it knows what it requested.
 */

/** Default page size for `GET /api/songs`. Comfortably above a real band's library. */
export const SONGS_PAGE = 200;

/** Ceiling for a caller-supplied `limit`; larger values are clamped, not rejected. */
export const SONGS_PAGE_MAX = 500;
