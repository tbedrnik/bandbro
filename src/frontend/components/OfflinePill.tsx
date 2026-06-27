import { cn } from "@frontend/lib/utils";

/**
 * Offline indicator — tells the player a setlist is available without signal.
 * Ported from Claude Design "Design System.dc.html".
 */
export function OfflinePill({
	label = "Offline",
	detail = "setlist downloaded",
	className,
}: {
	label?: string;
	detail?: string;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-2.5 rounded-full bg-secondary px-3.5 py-[7px]",
				className,
			)}
		>
			<span className="size-[9px] rounded-full bg-ok shadow-[0_0_0_3px_rgba(63,174,122,0.18)]" />
			<span className="font-mono text-[12.5px] font-medium text-foreground">
				{label}
			</span>
			<span className="text-[12.5px] text-muted-foreground">{detail}</span>
		</span>
	);
}
