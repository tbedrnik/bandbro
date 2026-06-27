import type { Scope } from "@frontend/lib/scopes";
import { cn } from "@frontend/lib/utils";

/**
 * The scope pill row (Curated · Band A · Band B · Personal). The active scope is
 * filled with the accent; the rest are quiet chips. Ported from the Library design.
 */
export function ScopeSwitcher({
	scopes,
	value,
	onChange,
	counts,
}: {
	scopes: Scope[];
	value: string;
	onChange: (param: string) => void;
	counts?: Record<string, number>;
}) {
	return (
		<div className="flex flex-wrap gap-2">
			{scopes.map((scope) => {
				const active = scope.param === value;
				const count = counts?.[scope.param];
				return (
					<button
						key={scope.param}
						type="button"
						onClick={() => onChange(scope.param)}
						className={cn(
							"inline-flex items-center gap-2 rounded-xl px-4 py-2 font-display text-sm font-semibold transition-colors",
							active
								? "bg-foreground text-background"
								: "bg-card text-foreground hover:bg-muted",
						)}
					>
						{scope.name}
						{count !== undefined && (
							<span
								className={cn(
									"rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium",
									active
										? "bg-background/20 text-background"
										: "bg-secondary text-muted-foreground",
								)}
							>
								{count}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
