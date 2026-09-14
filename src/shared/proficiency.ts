/**
 * Who can play what (CLAUDE.md §D26).
 *
 * Three friends who perform as a duo, another duo and a trio don't have three different
 * repertoires because they keep three libraries — they have three repertoires because
 * different people can play different things. Modelling *that* means one shared library
 * (§D25) can still answer "what can tonight's lineup actually play?".
 *
 * `UNKNOWN` is the absence of an answer, deliberately not "can't play". A wall of red on
 * day one would be a lie about 200 songs nobody has been asked about yet, and it would
 * make the one genuinely useful signal — someone is still learning this — invisible.
 */

export const PROFICIENCY_LEVELS = [
	"UNKNOWN",
	"LEARNING",
	"FOLLOW",
	"PLAY",
] as const;

export type ProficiencyLevel = (typeof PROFICIENCY_LEVELS)[number];

/** Ascending confidence. `UNKNOWN` sits outside this — it is not a low score. */
const KNOWN_ORDER: ProficiencyLevel[] = ["LEARNING", "FOLLOW", "PLAY"];

export type Readiness = {
	/** The weakest level anyone has actually claimed, or UNKNOWN if nobody has. */
	level: ProficiencyLevel;
	/** How many of the lineup haven't said. */
	unknown: number;
	total: number;
};

/**
 * How ready a lineup is for one song: the weakest link among the players who have
 * answered, plus a count of those who haven't.
 *
 * Unknowns are reported *beside* the level rather than folded into it. One player still
 * learning a song and one who simply hasn't been asked are different situations with
 * different fixes — rehearse it, or go and ask — and a single collapsed score would
 * hide whichever it ranked lower.
 */
export function lineupReadiness(levels: ProficiencyLevel[]): Readiness {
	const total = levels.length;
	const known = levels.filter((l) => l !== "UNKNOWN");
	const unknown = total - known.length;
	if (!known.length) return { level: "UNKNOWN", unknown, total };
	const weakest = known.reduce((worst, l) =>
		KNOWN_ORDER.indexOf(l) < KNOWN_ORDER.indexOf(worst) ? l : worst,
	);
	return { level: weakest, unknown, total };
}

export const LEVEL_LABELS: Record<ProficiencyLevel, string> = {
	UNKNOWN: "Not said",
	LEARNING: "Learning",
	FOLLOW: "Can follow",
	PLAY: "Can play",
};

/** What the whole lineup's state reads as on a row in the setlist builder. */
export function readinessLabel(readiness: Readiness): string {
	const { level, unknown, total } = readiness;
	if (!total) return "";
	const tail = unknown ? ` · ${unknown} not said` : "";
	if (level === "UNKNOWN") return `Nobody's said${total > 1 ? " yet" : ""}`;
	if (level === "PLAY") return `Everyone can play${tail}`;
	if (level === "FOLLOW") return `Can follow${tail}`;
	return `Someone's learning${tail}`;
}

/**
 * Sort key for the builder: songs the lineup can play first, then ones needing a
 * run-through, then ones still being learned, and the unasked last. Ties keep their
 * incoming order, so an alphabetical list stays alphabetical inside each band.
 */
export function readinessRank(readiness: Readiness): number {
	switch (readiness.level) {
		case "PLAY":
			return readiness.unknown ? 1 : 0;
		case "FOLLOW":
			return 2;
		case "LEARNING":
			return 3;
		default:
			return 4;
	}
}
