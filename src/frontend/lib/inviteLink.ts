import { appBase } from "@frontend/lib/fanSession";

/**
 * Band invite link URLs (CLAUDE.md §D13). Same reasoning as the fan share link: the QR has
 * to encode the origin this app is actually reachable at, so `appBase()` is reused rather
 * than a branded domain that may not resolve. Codes travel lowercased — easier to type off a
 * screen, and the API folds the case back.
 */
export function inviteUrl(code: string): string {
	return `${appBase()}/join/${code.toLowerCase()}`;
}

/** Short display form for the URL pill (no protocol). */
export function inviteDisplayUrl(code: string): string {
	if (typeof window === "undefined") return `…/join/${code.toLowerCase()}`;
	return `${window.location.host}/app/join/${code.toLowerCase()}`;
}
