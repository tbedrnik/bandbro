import { cn } from "@frontend/lib/utils";

/** The two chord views derived from one chart + a capo value. */
export type ChordView = "fingered" | "concert";

type Props = {
	value: ChordView;
	onValueChange: (value: ChordView) => void;
	/** Optional caption under the toggle (e.g. "capo player default"). */
	caption?: string;
	className?: string;
};

const OPTIONS: { value: ChordView; label: string }[] = [
	{ value: "fingered", label: "As-fingered" },
	{ value: "concert", label: "Concert" },
];

/**
 * The signature capo / concert view toggle. One chart, two truths: "as-fingered"
 * shows the played shapes (capo players); "concert" transposes up by the capo
 * amount (bass / keys). The same recognizable control appears on the Song View,
 * Live mode and Preferences. Ported from Claude Design "Design System.dc.html".
 */
export function CapoToggle({
	value,
	onValueChange,
	caption,
	className,
}: Props) {
	return (
		<div className={cn("inline-flex flex-col", className)}>
			<div
				role="radiogroup"
				className="flex gap-1 rounded-[11px] bg-secondary p-1"
			>
				{OPTIONS.map((opt) => {
					const active = opt.value === value;
					return (
						<button
							key={opt.value}
							type="button"
							role="radio"
							aria-checked={active}
							onClick={() => onValueChange(opt.value)}
							className={cn(
								"flex-1 whitespace-nowrap rounded-lg px-4 py-[9px] text-center font-display text-[13.5px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
								active
									? "bg-primary font-semibold text-primary-foreground shadow-sm"
									: "font-medium text-muted-foreground hover:text-foreground",
							)}
						>
							{opt.label}
						</button>
					);
				})}
			</div>
			{caption && (
				<div className="mt-[7px] text-center font-mono text-[10.5px] text-muted-foreground">
					{caption}
				</div>
			)}
		</div>
	);
}
