import { lineupOptionLabel } from "@frontend/lib/lineups";
import { cn } from "@frontend/lib/utils";

export type PickableLineup = {
	id: string;
	name: string;
	isDefault: boolean;
	organizationId: string;
};

/**
 * Choose which lineup a setlist belongs to (CLAUDE.md §D25).
 *
 * Deliberately one flat list across every band rather than a band picker plus a lineup
 * picker: "Banda · Duo Tomi Kohy" is a single decision a player can make in one tap,
 * and two chained selects for what is usually a two-item choice is worse on a phone.
 *
 * Renders nothing when there is only one option — the picker exists to resolve an
 * ambiguity, and with one lineup there isn't one.
 */
export function LineupPicker({
	lineups,
	bandName,
	value,
	onChange,
	label = "Setlist belongs to",
}: {
	lineups: PickableLineup[];
	bandName: (organizationId: string) => string;
	value: string | null;
	onChange: (lineupId: string) => void;
	label?: string;
}) {
	if (lineups.length < 2) return null;
	return (
		<div className="mt-4">
			<span className="mb-1.5 block font-display text-xs font-semibold tracking-wider text-muted-foreground uppercase">
				{label}
			</span>
			<div className="flex flex-wrap gap-2">
				{lineups.map((lineup) => (
					<button
						key={lineup.id}
						type="button"
						onClick={() => onChange(lineup.id)}
						className={cn(
							"inline-flex items-center rounded-xl px-3 py-1.5 font-display text-sm font-semibold transition-colors",
							lineup.id === value
								? "bg-foreground text-background"
								: "bg-card text-foreground hover:bg-muted",
						)}
					>
						{lineupOptionLabel(lineup, bandName(lineup.organizationId))}
					</button>
				))}
			</div>
		</div>
	);
}
