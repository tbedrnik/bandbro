import { cn } from "@frontend/lib/utils";

type MetaChipProps = {
	/** Short uppercase key, e.g. "KEY", "CAPO", "BPM". */
	label: string;
	value: React.ReactNode;
	className?: string;
};

/**
 * A monospace metadata chip — a labelled song attribute such as KEY · Am or
 * CAPO · 2. Ported from Claude Design "Design System.dc.html".
 */
export function MetaChip({ label, value, className }: MetaChipProps) {
	return (
		<span
			className={cn(
				"flex items-baseline gap-1.5 rounded-md bg-secondary px-[11px] py-[7px] font-mono text-[12.5px]",
				className,
			)}
		>
			<span className="uppercase text-muted-foreground">{label}</span>
			<span className="font-semibold text-foreground">{value}</span>
		</span>
	);
}

/** A free-form tag chip (folk, slow, …). */
export function Tag({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"rounded-md border border-border px-[11px] py-[7px] text-[12.5px] text-muted-foreground",
				className,
			)}
		>
			{children}
		</span>
	);
}
