import { api } from "@frontend/api";
import { CapoToggle } from "@frontend/components/CapoToggle";
import { DisplaySettings } from "@frontend/components/DisplaySettings";
import { LiveSetlistPanel } from "@frontend/components/LiveSetlistPanel";
import { ShareWithFansModal } from "@frontend/components/ShareWithFansModal";
import { SongSheet } from "@frontend/components/SongSheet";
import {
	Drawer,
	DrawerContent,
	DrawerTitle,
} from "@frontend/components/ui/drawer";
import { useUser } from "@frontend/contexts/UserContext";
import {
	GAP_SCALES,
	LIVE_CHORD_SIZE,
	LIVE_LYRIC_SIZE,
	TEXT_SCALES,
	useLiveDisplay,
} from "@frontend/lib/liveDisplay";
import { getOfflineSetlist, useOnline } from "@frontend/lib/offline";
import { useFanSession } from "@frontend/lib/useFanSession";
import { useFitScale } from "@frontend/lib/useFitScale";
import { cn } from "@frontend/lib/utils";
import { displayKey } from "@shared/notation";
import type { ChordView } from "@shared/transpose";
import { transposeKey } from "@shared/transpose";
import {
	IconChevronDown,
	IconChevronLeft,
	IconChevronRight,
	IconChevronUp,
	IconListNumbers,
	IconMinus,
	IconPlayerPause,
	IconPlayerPlay,
	IconPlus,
	IconShare3,
	IconX,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/_protected/live/$id")({
	// `?song=` opens the set at a given position — how the offline search jumps straight
	// to the song it found (CLAUDE.md §D15).
	// Returning `{}` rather than `{song: undefined}` keeps the param genuinely optional,
	// so every other `to="/live/$id"` link stays a plain link with no search object.
	validateSearch: (search: Record<string, unknown>): { song?: number } => {
		const song = Number(search.song);
		return Number.isInteger(song) && song >= 0 ? { song } : {};
	},
	component: LiveMode,
});

/** Which face of the bottom drawer is showing. `null` = closed, only the peek bar. */
type Panel = "controls" | "setlist";

function useLiveSetlist(id: string) {
	const online = useOnline();
	const query = useQuery({
		...api.songbooks({ id }).get.queryOptions({}),
		// The downloaded snapshot is what makes Live mode work with no signal at all: it
		// seeds the query before the first fetch, so the chart is on screen whether the
		// network is merely flaky mid-set or absent since launch. `retry: false` keeps a
		// dead network from queueing retries behind every song change.
		initialData: () => getOfflineSetlist(id) ?? undefined,
		retry: false,
		refetchOnWindowFocus: false,
	});
	return { ...query, online };
}

function LiveMode() {
	const { id } = Route.useParams();
	// Optional: offline the session comes from the on-device snapshot, and on a device
	// that never had one there is still a downloaded setlist worth performing.
	const user = useUser({ optional: true });
	const { data: setlist, online } = useLiveSetlist(id);
	const { song: openAt } = Route.useSearch();

	const [index, setIndex] = useState(openAt ?? 0);
	const [view, setView] = useState<ChordView>(
		(user?.defaultChordView as ChordView) ?? "fingered",
	);
	const [transpose, setTranspose] = useState(0);
	const [scrolling, setScrolling] = useState(false);
	const [speed, setSpeed] = useState(2);
	const [shareOpen, setShareOpen] = useState(false);
	const [panel, setPanel] = useState<Panel | null>(null);
	const [display, setDisplay] = useLiveDisplay();
	const scrollRef = useRef<HTMLDivElement>(null);

	const fan = useFanSession(id);

	const songs = setlist?.songs ?? [];
	const entry = songs[index];

	// Once the band has opened "Share with fans", keep the live session's current-song
	// index in sync so fans auto-follow the set. A failed sync is silent by design: the
	// band's own chart must never stall because the room's copy couldn't be updated.
	const { syncCurrent } = fan;
	useEffect(() => {
		if (!online) return;
		syncCurrent(index);
	}, [index, syncCurrent, online]);

	// Auto-scroll loop.
	useEffect(() => {
		if (!scrolling) return;
		let raf = 0;
		let acc = 0;
		const step = () => {
			acc += speed / 4;
			if (acc >= 1 && scrollRef.current) {
				scrollRef.current.scrollTop += Math.floor(acc);
				acc = 0;
			}
			raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [scrolling, speed]);

	// Reset transpose + scroll when switching songs.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on song change
	useEffect(() => {
		setTranspose(0);
		if (scrollRef.current) scrollRef.current.scrollTop = 0;
	}, [index]);

	// "Fit to screen" re-measures whenever anything that changes the rendered height does.
	const fitScale = useFitScale({
		enabled: display.fit,
		viewportRef: scrollRef,
		resetKey: `${id}:${index}:${display.gapIdx}:${display.columns}:${view}:${transpose}`,
	});
	const textScale = display.fit ? fitScale : TEXT_SCALES[display.textIdx];

	if (!setlist) {
		return (
			<div className="grid min-h-dvh place-items-center bg-background px-6 text-center text-muted-foreground">
				{online ? (
					"Loading…"
				) : (
					<div>
						<p>This setlist wasn't downloaded to this device.</p>
						<Link to="/offline" className="mt-3 inline-block text-primary">
							See what is available offline →
						</Link>
					</div>
				)}
			</div>
		);
	}
	if (!entry) {
		return (
			<div className="grid min-h-dvh place-items-center bg-background text-muted-foreground">
				This setlist is empty.
			</div>
		);
	}

	const chart = entry.chart;
	const song = chart.song;
	const capo = chart.capo ?? 0;
	const steps = (view === "concert" ? capo : 0) + transpose;
	const displayedKey = chart.key
		? displayKey(transposeKey(chart.key, steps))
		: "";
	const next = songs[index + 1];
	const position = `${index + 1}/${songs.length}`;
	const transposeLabel =
		displayedKey || (transpose >= 0 ? `+${transpose}` : `${transpose}`);

	const goTo = (to: number) => {
		setIndex(Math.min(songs.length - 1, Math.max(0, to)));
		// Jumping from the setlist panel: hand the chart straight back, since the point
		// of the tap was to see that song.
		setPanel(null);
	};

	return (
		<div className="flex h-dvh flex-col bg-background text-foreground">
			{/* Top bar — deliberately thin: everything actionable moved to the bottom
			    drawer, within thumb reach, which is also what stopped this row from
			    overflowing a phone. */}
			<div className="flex items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
				<span className="inline-flex flex-none items-center gap-2 rounded-full bg-secondary px-2.5 py-1">
					<span
						className="size-2 rounded-full"
						style={{ background: online ? "var(--ok)" : "#c0392b" }}
					/>
					<span className="font-mono text-[11px]">
						{online ? "Online" : "Offline"}
					</span>
				</span>
				<span className="min-w-0 flex-1 truncate font-display text-sm text-muted-foreground">
					{setlist.title} · {position}
				</span>
				{/* Exiting lands on the setlist screen, which needs the network to load —
				    with no signal, send the player to the offline shelf instead. */}
				{online ? (
					<Link
						to="/setlists/$id"
						params={{ id }}
						className="grid size-8 flex-none place-items-center rounded-lg hover:bg-muted"
						aria-label="Exit live mode"
					>
						<IconX className="size-5" />
					</Link>
				) : (
					<Link
						to="/offline"
						className="grid size-8 flex-none place-items-center rounded-lg hover:bg-muted"
						aria-label="Exit live mode"
					>
						<IconX className="size-5" />
					</Link>
				)}
			</div>

			<ShareWithFansModal
				open={shareOpen}
				onClose={() => setShareOpen(false)}
				title="Share with the room"
				code={fan.code}
				nowPlaying={song.name}
				position={`${index + 1} / ${songs.length}`}
				watching={fan.watching}
			/>

			{/* Chart — the hero, scaled up. The song header scrolls away with it rather than
			    holding a permanent band across the top: on a tablet that row is a line of
			    lyrics, and the setlist name + position are already in the top bar. */}
			<div
				ref={scrollRef}
				className="live-scroll min-h-0 flex-1 overflow-auto px-6 py-4"
			>
				<div className="mb-3 flex items-baseline gap-3">
					<h1 className="font-display text-xl font-bold sm:text-2xl">
						{song.name}
					</h1>
					<span className="font-mono text-xs text-muted-foreground">
						{displayedKey && `KEY ${displayedKey}`}
						{capo > 0 && ` · CAPO ${capo}`}
					</span>
				</div>
				<SongSheet
					content={chart.content}
					capo={capo}
					view={view}
					transpose={transpose}
					lyricSize={Math.round(LIVE_LYRIC_SIZE * textScale)}
					chordSize={Math.round(LIVE_CHORD_SIZE * textScale)}
					gap={GAP_SCALES[display.gapIdx]}
					columns={display.columns}
				/>
			</div>

			{/* Peek bar — the fan view's pattern (CLAUDE.md §D10), band-facing and in the
			    app's own theme. What stays out here is what a player touches *mid-song*
			    with one thumb: prev/next, auto-scroll (a runaway scroll has to be stoppable
			    instantly) and the jump-to-song list. Everything you set *between* songs —
			    capo view, transpose, scroll speed, text size, sharing — is one tap away in
			    the drawer, which is what stopped this row overflowing a 390px phone.
			    From `lg` up there is room to keep capo + transpose inline as well. */}
			<div className="flex items-center gap-2 border-t border-border bg-card px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 sm:px-4">
				<BigBtn
					label="Previous song"
					disabled={index === 0}
					onClick={() => goTo(index - 1)}
				>
					<IconChevronLeft className="size-7" />
				</BigBtn>

				<button
					type="button"
					onClick={() => setPanel("controls")}
					aria-label="Show live controls"
					aria-expanded={panel !== null}
					className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1 text-left transition-colors hover:bg-secondary lg:max-w-xs"
				>
					<span className="min-w-0 flex-1">
						<span className="block truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
							{position}
							{displayedKey && ` · KEY ${displayedKey}`}
							{capo > 0 && ` · CAPO ${capo}`}
						</span>
						<span className="block truncate font-display text-[15px] font-bold leading-tight sm:text-[17px]">
							{song.name}
						</span>
					</span>
					<IconChevronUp className="size-4 flex-none text-muted-foreground" />
				</button>

				{/* Wide screens have room to keep the two between-song controls a player
				    reaches for most out here as well; they stay in the drawer too, so a
				    phone loses nothing. */}
				<span className="hidden flex-1 lg:block" />
				<div className="hidden items-center gap-2 lg:flex">
					<CapoToggle value={view} onValueChange={setView} />
					<TransposeControl
						label={transposeLabel}
						onDown={() => setTranspose((t) => t - 1)}
						onUp={() => setTranspose((t) => t + 1)}
					/>
				</div>

				<IconBtn
					label={scrolling ? "Pause auto-scroll" : "Start auto-scroll"}
					active={scrolling}
					onClick={() => setScrolling((s) => !s)}
				>
					{scrolling ? (
						<IconPlayerPause className="size-5" />
					) : (
						<IconPlayerPlay className="size-5" />
					)}
				</IconBtn>
				<IconBtn
					label="Setlist and search"
					active={panel === "setlist"}
					onClick={() => setPanel("setlist")}
				>
					<IconListNumbers className="size-5" />
				</IconBtn>

				<BigBtn
					label="Next song"
					disabled={index >= songs.length - 1}
					onClick={() => goTo(index + 1)}
				>
					<IconChevronRight className="size-7" />
				</BigBtn>
			</div>

			<Drawer
				open={panel !== null}
				onOpenChange={(open) => !open && setPanel(null)}
			>
				<DrawerContent className="max-h-[88dvh] border-border bg-card text-foreground">
					{/* Header mirrors the peek bar, so opening the drawer never loses your
					    place in the set. */}
					<button
						type="button"
						onClick={() => setPanel(null)}
						aria-label="Hide live controls"
						className="flex w-full items-center gap-3 px-4 pb-2 pt-3 text-left"
					>
						<span className="min-w-0 flex-1">
							<span className="block truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
								{setlist.title} · {position}
							</span>
							<DrawerTitle className="truncate font-display text-[17px] font-bold leading-tight">
								{song.name}
							</DrawerTitle>
							{next && (
								<span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
									up next · {next.chart.song.name}
								</span>
							)}
						</span>
						<IconChevronDown className="size-4 flex-none text-muted-foreground" />
					</button>

					<div className="mx-4 mb-3 flex gap-1 rounded-[11px] bg-secondary p-1">
						<TabBtn
							active={panel === "controls"}
							onClick={() => setPanel("controls")}
						>
							Controls
						</TabBtn>
						<TabBtn
							active={panel === "setlist"}
							onClick={() => setPanel("setlist")}
						>
							Setlist
						</TabBtn>
					</div>

					{panel === "setlist" ? (
						<div className="flex min-h-0 flex-1 flex-col pb-[calc(14px+env(safe-area-inset-bottom))]">
							<LiveSetlistPanel
								entries={songs}
								currentIndex={index}
								onSelect={goTo}
							/>
						</div>
					) : (
						<div
							data-vaul-no-drag
							className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-[calc(18px+env(safe-area-inset-bottom))]"
						>
							<CapoToggle
								value={view}
								onValueChange={setView}
								className="w-full"
							/>
							{/* One control per row: at phone width a two-up row wraps the speed
							    readout onto a second line. */}
							<TransposeControl
								label={transposeLabel}
								caption="transpose"
								onDown={() => setTranspose((t) => t - 1)}
								onUp={() => setTranspose((t) => t + 1)}
								className="w-full"
							/>
							<div className="flex gap-2">
								<div className="flex h-[42px] flex-1 items-center gap-1 rounded-xl bg-secondary px-1">
									<SmallBtn
										onClick={() => setScrolling((s) => !s)}
										label={
											scrolling ? "Pause auto-scroll" : "Start auto-scroll"
										}
									>
										{scrolling ? (
											<IconPlayerPause className="size-4" />
										) : (
											<IconPlayerPlay className="size-4" />
										)}
									</SmallBtn>
									<SmallBtn
										onClick={() => setSpeed((s) => Math.max(1, s - 1))}
										label="Scroll slower"
									>
										<IconMinus className="size-4" />
									</SmallBtn>
									<span className="min-w-0 flex-1 text-center font-mono text-[11px] text-muted-foreground">
										SCROLL {speed}
									</span>
									<SmallBtn
										onClick={() => setSpeed((s) => Math.min(8, s + 1))}
										label="Scroll faster"
									>
										<IconPlus className="size-4" />
									</SmallBtn>
								</div>
							</div>

							<DisplaySettings
								value={display}
								onChange={setDisplay}
								fitScale={fitScale}
							/>

							{/* Sharing is the one control in Live mode that genuinely needs the
							    network — the fan view is served, not cached — so with no signal
							    it is hidden rather than offered as a dead button. */}
							{online && (
								<button
									type="button"
									onClick={() => {
										fan.ensure();
										setShareOpen(true);
										setPanel(null);
									}}
									className="mt-1 inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 font-display text-[13px] font-semibold text-primary-foreground"
								>
									<IconShare3 className="size-4" /> Share with fans
								</button>
							)}
						</div>
					)}
				</DrawerContent>
			</Drawer>
		</div>
	);
}

function BigBtn({
	children,
	label,
	onClick,
	disabled,
}: {
	children: React.ReactNode;
	label: string;
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onClick}
			disabled={disabled}
			className="grid size-12 flex-none place-items-center rounded-2xl bg-secondary shadow-sm transition-colors hover:bg-muted disabled:opacity-30 sm:size-14"
		>
			{children}
		</button>
	);
}

/** A square secondary action on the peek bar; `active` marks a running toggle. */
function IconBtn({
	children,
	label,
	active,
	onClick,
}: {
	children: React.ReactNode;
	label: string;
	active?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"grid size-11 flex-none place-items-center rounded-xl transition-colors",
				active
					? "bg-primary text-primary-foreground"
					: "bg-secondary hover:bg-muted",
			)}
		>
			{children}
		</button>
	);
}

function TransposeControl({
	label,
	caption,
	onDown,
	onUp,
	className,
}: {
	/** The resulting key, or the step count when the chart has no key. */
	label: string;
	/** Names the control where it isn't obvious from context (in the drawer). */
	caption?: string;
	onDown: () => void;
	onUp: () => void;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex h-[42px] items-center gap-1 rounded-xl bg-secondary px-1",
				className,
			)}
		>
			<SmallBtn onClick={onDown} label="Transpose down">
				<IconMinus className="size-4" />
			</SmallBtn>
			<span className="min-w-10 flex-1 text-center leading-none">
				<span className="block font-mono text-sm">{label}</span>
				{caption && (
					<span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
						{caption}
					</span>
				)}
			</span>
			<SmallBtn onClick={onUp} label="Transpose up">
				<IconPlus className="size-4" />
			</SmallBtn>
		</div>
	);
}

function TabBtn({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"h-9 flex-1 rounded-lg font-display text-[13px] font-semibold transition-colors",
				active
					? "bg-primary text-primary-foreground shadow-sm"
					: "text-muted-foreground",
			)}
		>
			{children}
		</button>
	);
}

function SmallBtn({
	children,
	label,
	onClick,
}: {
	children: React.ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onClick}
			className="grid size-9 flex-none place-items-center rounded-lg bg-background transition-colors hover:bg-muted"
		>
			{children}
		</button>
	);
}
