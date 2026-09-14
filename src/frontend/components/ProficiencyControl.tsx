import { api, apiClient } from "@frontend/api";
import { cn } from "@frontend/lib/utils";
import {
	LEVEL_LABELS,
	PROFICIENCY_LEVELS,
	type ProficiencyLevel,
} from "@shared/proficiency";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

/**
 * "Can you play this?" — the caller's own mark on a song (CLAUDE.md §D26).
 *
 * Available to every reader, because it is a fact about the player rather than an edit
 * to the song. Optimistic, since the answer is the player's own and the only thing that
 * can reject it is the network.
 */
export function ProficiencyControl({
	slug,
	level,
	bandLevels,
}: {
	slug: string;
	level: ProficiencyLevel;
	bandLevels?: { userId: string; name: string; level: ProficiencyLevel }[];
}) {
	const queryClient = useQueryClient();
	const [optimistic, setOptimistic] = useState<ProficiencyLevel | null>(null);
	const current = optimistic ?? level;

	const save = useMutation({
		mutationFn: async (next: ProficiencyLevel) => {
			const { error } = await apiClient.api
				.songs({ slug })
				.proficiency.put({ level: next });
			if (error) throw new Error(String(error.status));
		},
		onSuccess: () => {
			queryClient.invalidateQueries(api.songs.get.queryFilter());
			queryClient.invalidateQueries(api.songs({ slug }).get.queryFilter());
		},
		onError: () => setOptimistic(null),
	});

	const others = (bandLevels ?? []).filter((m) => m.level !== "UNKNOWN");

	return (
		<div>
			<div className="mb-2 font-display text-xs font-semibold tracking-wider text-muted-foreground uppercase">
				Can you play this?
			</div>
			<div className="flex flex-col gap-1">
				{PROFICIENCY_LEVELS.map((option) => (
					<button
						key={option}
						type="button"
						onClick={() => {
							setOptimistic(option);
							save.mutate(option);
						}}
						className={cn(
							"rounded-lg px-3 py-2 text-left font-display text-sm transition-colors",
							option === current
								? "bg-foreground text-background"
								: "bg-card text-muted-foreground hover:bg-muted",
						)}
					>
						{LEVEL_LABELS[option]}
					</button>
				))}
			</div>
			{save.isError && (
				<p className="mt-2 text-xs text-destructive">
					Couldn't save — check your connection.
				</p>
			)}
			{others.length > 0 && (
				<div className="mt-3 border-t border-border pt-3">
					<div className="mb-1.5 font-display text-xs font-semibold tracking-wider text-muted-foreground uppercase">
						Your band
					</div>
					<ul className="space-y-1">
						{others.map((m) => (
							<li
								key={m.userId}
								className="flex items-baseline justify-between gap-2 text-xs"
							>
								<span className="text-foreground">{m.name}</span>
								<span className="font-mono text-muted-foreground">
									{LEVEL_LABELS[m.level]}
								</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
