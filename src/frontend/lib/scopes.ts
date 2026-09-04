import { auth } from "@frontend/auth";
import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";

/** A place a song can live and be browsed from. */
export type Scope = {
	kind: "curated" | "personal" | "band";
	/** Organization id, or null for the curated library. */
	id: string | null;
	name: string;
	/** Value used in the Library `scope` query param ("curated" or an org id). */
	param: string;
};

export const CURATED: Scope = {
	kind: "curated",
	id: null,
	name: "Curated",
	param: "curated",
};

function isPersonal(org: { metadata?: string | null }): boolean {
	if (!org.metadata) return false;
	try {
		return JSON.parse(org.metadata)?.personal === true;
	} catch {
		return false;
	}
}

type OrgLite = { id: string; name: string; metadata?: string | null };

export function orgToScope(org: OrgLite): Scope {
	return {
		kind: isPersonal(org) ? "personal" : "band",
		id: org.id,
		name: isPersonal(org) ? "Personal" : org.name,
		param: org.id,
	};
}

/**
 * All scopes the user can browse: Curated · each Band · Personal. Backed by
 * better-auth's organization list. See CLAUDE.md §G1.
 */
export function useScopes() {
	const { data: orgs, isPending } = useStore(auth.useListOrganizations);
	const list = (orgs ?? []) as OrgLite[];
	const personal = list.find(isPersonal);
	const bands = list.filter((o) => !isPersonal(o));

	const scopes: Scope[] = [
		CURATED,
		...bands.map(orgToScope),
		...(personal ? [orgToScope(personal)] : []),
	];

	return {
		scopes,
		bands: bands.map(orgToScope),
		personal: personal ? orgToScope(personal) : null,
		isPending,
	};
}

const LAST_SCOPE_KEY = "bandbro:library:scope";

function readLastScope(): string {
	try {
		return localStorage.getItem(LAST_SCOPE_KEY) ?? CURATED.param;
	} catch {
		return CURATED.param;
	}
}

/**
 * The Library's scope selection, remembered per device: coming back to the Library
 * lands on the band you were last browsing instead of resetting to Curated. Kept out
 * of the URL deliberately — this is a "where I left off" preference, not a shareable
 * address. The remembered value is dropped once the org list confirms the user can no
 * longer browse it (left the band, or a different account signed in on this device).
 */
export function useRememberedScope(scopes: Scope[], isPending: boolean) {
	const [param, setParam] = useState(readLastScope);
	const available = scopes.map((s) => s.param).join("|");

	useEffect(() => {
		if (isPending) return;
		if (available.split("|").includes(param)) return;
		setParam(CURATED.param);
		try {
			localStorage.removeItem(LAST_SCOPE_KEY);
		} catch {
			// ignore — the in-memory fallback above is enough
		}
	}, [available, isPending, param]);

	const select = (next: string) => {
		setParam(next);
		try {
			localStorage.setItem(LAST_SCOPE_KEY, next);
		} catch {
			// storage unavailable (private mode) — selection still works for this visit
		}
	};

	return [param, select] as const;
}
