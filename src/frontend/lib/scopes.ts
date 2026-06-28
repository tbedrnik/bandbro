import { auth } from "@frontend/auth";
import { useStore } from "@nanostores/react";

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
