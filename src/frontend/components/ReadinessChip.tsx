import { cn } from "@frontend/lib/utils";
import { type Readiness, readinessLabel } from "@shared/proficiency";

/**
 * How ready a lineup is for one song (CLAUDE.md §D26) — the signal the setlist builder
 * sorts on. Colour carries the level; the text carries the gap, because "everyone can
 * play it" and "everyone who answered can play it" are different facts and only one of
 * them is safe to put on a gig.
 */
export function ReadinessChip({
	readiness,
	className,
}: {
	readiness: Readiness | null | undefined;
	className?: string;
}) {
	if (!readiness?.total) return null;
	const { level, unknown } = readiness;
	const tone =
		level === "PLAY" && !unknown
			? "bg-accent-wash text-primary"
			: level === "UNKNOWN"
				? "bg-secondary text-muted-foreground"
				: "bg-secondary text-foreground";

	return (
		<span
			className={cn(
				"rounded-md px-2 py-[3px] font-mono text-[10px] font-semibold tracking-[0.03em] whitespace-nowrap",
				tone,
				className,
			)}
		>
			{readinessLabel(readiness)}
		</span>
	);
}
