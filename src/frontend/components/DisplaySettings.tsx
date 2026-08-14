import {
	GAP_SCALES,
	type LiveDisplay,
	TEXT_SCALES,
} from "@frontend/lib/liveDisplay";
import { useTheme } from "@frontend/lib/theme";
import { cn } from "@frontend/lib/utils";
import {
	IconArrowAutofitHeight,
	IconColumns1,
	IconColumns2,
	IconColumns3,
	IconLineHeight,
	IconMinus,
	IconMoon,
	IconPlus,
	IconSun,
	IconTextSize,
} from "@tabler/icons-react";

/** Three columns is a landscape-tablet setting; on a phone it's unreadable but harmless. */
const COLUMN_OPTIONS = [
	{ count: 1 as const, Icon: IconColumns1 },
	{ count: 2 as const, Icon: IconColumns2 },
	{ count: 3 as const, Icon: IconColumns3 },
];

/**
 * Live mode's display controls — the band-facing sibling of the fan view's drawer
 * controls: text size, line spacing, one or two columns, and "fit to screen" (which
 * takes the size stepper over and sizes the text so the song lands on one screen).
 * Rendered as a panel above the Live control bar.
 */
export function DisplaySettings({
	value,
	onChange,
	fitScale,
}: {
	value: LiveDisplay;
	onChange: (patch: Partial<LiveDisplay>) => void;
	/** The scale "fit to screen" settled on, shown in place of the manual size. */
	fitScale: number;
}) {
	const textScale = value.fit ? fitScale : TEXT_SCALES[value.textIdx];
	// Live mode is full-bleed, so the nav's theme toggle isn't reachable from the stage.
	const { theme, toggle } = useTheme();

	return (
		<div className="w-[290px] rounded-2xl border border-border bg-card p-3 shadow-xl">
			<Row>
				<button
					type="button"
					onClick={() => onChange({ fit: !value.fit })}
					aria-pressed={value.fit}
					className={cn(
						"flex h-10 flex-1 items-center gap-2 rounded-xl px-3 font-display text-[13px] font-semibold transition-colors",
						value.fit
							? "bg-primary text-primary-foreground"
							: "bg-secondary text-foreground",
					)}
				>
					<IconArrowAutofitHeight className="size-[18px]" />
					Fit to screen
				</button>
				<button
					type="button"
					aria-label="Toggle theme"
					onClick={toggle}
					className="grid size-10 flex-none place-items-center rounded-xl bg-secondary text-foreground transition-colors hover:bg-muted"
				>
					{theme === "dark" ? (
						<IconSun className="size-[18px]" />
					) : (
						<IconMoon className="size-[18px]" />
					)}
				</button>
			</Row>

			<Row>
				<Stepper
					label="Text size"
					icon={<IconTextSize className="size-4" />}
					value={`${Math.round(textScale * 100)}%`}
					disabled={value.fit}
					onDown={() => onChange({ textIdx: Math.max(0, value.textIdx - 1) })}
					onUp={() =>
						onChange({
							textIdx: Math.min(TEXT_SCALES.length - 1, value.textIdx + 1),
						})
					}
				/>
			</Row>

			<Row>
				<Stepper
					label="Line spacing"
					icon={<IconLineHeight className="size-4" />}
					value={`${Math.round(GAP_SCALES[value.gapIdx] * 100)}%`}
					onDown={() => onChange({ gapIdx: Math.max(0, value.gapIdx - 1) })}
					onUp={() =>
						onChange({
							gapIdx: Math.min(GAP_SCALES.length - 1, value.gapIdx + 1),
						})
					}
				/>
			</Row>

			<div className="flex gap-1 rounded-xl bg-secondary p-1">
				{COLUMN_OPTIONS.map(({ count, Icon }) => (
					<SegBtn
						key={count}
						active={value.columns === count}
						label={`${count} column${count > 1 ? "s" : ""}`}
						onClick={() => onChange({ columns: count })}
					>
						<Icon className="size-[18px]" /> {count}
					</SegBtn>
				))}
			</div>
		</div>
	);
}

function Row({ children }: { children: React.ReactNode }) {
	return <div className="mb-2 flex gap-2">{children}</div>;
}

function Stepper({
	label,
	icon,
	value,
	disabled,
	onDown,
	onUp,
}: {
	label: string;
	icon: React.ReactNode;
	value: string;
	disabled?: boolean;
	onDown: () => void;
	onUp: () => void;
}) {
	return (
		<div
			className={cn(
				"flex h-10 flex-1 items-center gap-1 rounded-xl bg-secondary px-1",
				disabled && "opacity-45",
			)}
		>
			<CtrlBtn label={`${label} down`} onClick={onDown} disabled={disabled}>
				<IconMinus className="size-4" />
			</CtrlBtn>
			<span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-muted-foreground">
				{icon}
				<span className="font-mono text-[11px] text-foreground">{value}</span>
			</span>
			<CtrlBtn label={`${label} up`} onClick={onUp} disabled={disabled}>
				<IconPlus className="size-4" />
			</CtrlBtn>
		</div>
	);
}

function CtrlBtn({
	label,
	onClick,
	disabled,
	children,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onClick}
			disabled={disabled}
			className="grid size-8 flex-none place-items-center rounded-lg text-foreground transition-colors hover:bg-background disabled:pointer-events-none"
		>
			{children}
		</button>
	);
}

function SegBtn({
	active,
	onClick,
	label,
	children,
}: {
	active: boolean;
	onClick: () => void;
	/** Spelled-out name, since the button itself only shows an icon and a digit. */
	label: string;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg font-display text-[12.5px] font-semibold transition-colors",
				active
					? "bg-primary text-primary-foreground shadow-sm"
					: "text-muted-foreground",
			)}
		>
			{children}
		</button>
	);
}
