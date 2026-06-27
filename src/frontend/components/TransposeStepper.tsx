import { cn } from "@frontend/lib/utils";
import { IconMinus, IconPlus } from "@tabler/icons-react";

type Props = {
	/** The key (or value) currently displayed, e.g. "Am". */
	value: string;
	onStepUp: () => void;
	onStepDown: () => void;
	/** Sublabel under the value, e.g. "original" or "+2". */
	caption?: string;
	className?: string;
};

/**
 * Transpose stepper — shift the displayed key up or down a semitone. A control
 * layered independently on top of the capo view. Ported from Claude Design
 * "Design System.dc.html".
 */
export function TransposeStepper({
	value,
	onStepUp,
	onStepDown,
	caption = "original",
	className,
}: Props) {
	const stepBtn =
		"flex size-[42px] items-center justify-center rounded-lg bg-background text-foreground shadow-sm transition-colors hover:bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

	return (
		<div
			className={cn(
				"flex w-[210px] items-center gap-3.5 rounded-[11px] bg-secondary p-1.5",
				className,
			)}
		>
			<button
				type="button"
				aria-label="Transpose down"
				onClick={onStepDown}
				className={stepBtn}
			>
				<IconMinus className="size-5" />
			</button>
			<div className="flex-1 text-center">
				<div className="font-mono text-xl font-semibold text-foreground">
					{value}
				</div>
				<div className="text-[11px] text-muted-foreground">{caption}</div>
			</div>
			<button
				type="button"
				aria-label="Transpose up"
				onClick={onStepUp}
				className={stepBtn}
			>
				<IconPlus className="size-5" />
			</button>
		</div>
	);
}
