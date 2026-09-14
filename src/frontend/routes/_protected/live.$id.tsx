import { api } from "@frontend/api";
import { CapoToggle } from "@frontend/components/CapoToggle";
import { DisplaySettings } from "@frontend/components/DisplaySettings";
import {
	LiveSetlistPanel,
	PlayedCheckbox,
} from "@frontend/components/LiveSetlistPanel";
import { ShareWithFansModal } from "@frontend/components/ShareWithFansModal";
import { SongSheet } from "@frontend/components/SongSheet";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@frontend/components/ui/alert-dialog";
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
import {
	AUTO_MARK_MS,
	formatPlayedAge,
	playedKey,
	usePlayedSongs,
} from "@frontend/lib/livePlayed";
import {
	getOfflineSetlist,
	useOfflineSync,
	useOnline,
} from "@frontend/lib/offline";
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
	IconMinus,
	IconPlayerPause,
	IconPlayerPlay,
	IconPlus,
	IconSettings,
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

/** "Leave Live Mode" — two destinations (the setlist needs the network), one button. */
const LEAVE_CLASS =
	"inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary px-4 font-display text-[13px] font-semibold transition-colors hover:bg-muted";

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
	// Opening a set on stage while there is still signal is the last chance to refresh
	// what this device will fall back to when the signal goes (§D7). Silent: the fresh
	// payload is what Live mode is already rendering, so there is nothing to confirm.
	useOfflineSync(id, online ? query.data : undefined);
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
	const { played, toggle, markPlayed, resume, keepResumed, startFresh } =
		usePlayedSongs(id);

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

	// A song counts as played once it has been on screen for a minute (CLAUDE.md §D24) —
	// long enough that you were performing it rather than passing through on the way to
	// song 14. The timer waits for the resume prompt to be answered, so opening last
	// month's set and choosing "new gig" can't have already marked song one.
	const currentKey = playedKey(entry, index);
	const currentPlayed = played.has(currentKey);
	const hasEntry = entry !== undefined;
	useEffect(() => {
		if (resume || currentPlayed || !hasEntry) return;
		const timer = setTimeout(() => markPlayed(currentKey), AUTO_MARK_MS);
		return () => clearTimeout(timer);
		// Deliberately keyed on *this* song's mark, not on the whole set: ticking song 9
		// off in the panel must not restart the clock on the song being played.
	}, [currentKey, currentPlayed, hasEntry, resume, markPlayed]);

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
		// Everything that changes the song's rendered height, the chorus collapse
		// included — it removes whole sections, so the fit must be searched again.
		resetKey: `${id}:${index}:${display.gapIdx}:${display.columns}:${view}:${transpose}:${display.collapseChoruses}`,
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
	// The peek bar is the only place the song is named now, so it names it the way the
	// library does — title plus whoever wrote or performed it.
	const artist = (song.credits ?? [])
		.map((credit) => credit.artist?.name ?? "")
		.filter(Boolean)
		.join(", ");
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
			{/* Opening a set that still carries marks is ambiguous in a way only the player
			    can settle: the same evening after a break, or a new gig with the same set.
			    Guessing from the timestamp gets it wrong for any band that plays two sets an
			    hour apart, so we ask — once, and only when there is something to ask about. */}
			<AlertDialog
				open={resume !== null}
				// Dismissing without choosing (Escape) keeps the marks: it is the answer
				// that throws nothing away, and the checkboxes are there to fix either way.
				onOpenChange={(open) => {
					if (!open) keepResumed();
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Continue this set?</AlertDialogTitle>
						<AlertDialogDescription>
							{resume?.ids.length === 1
								? "1 song is marked as played"
								: `${resume?.ids.length ?? 0} songs are marked as played`}
							, last updated {formatPlayedAge(resume?.updatedAt ?? 0)}. Start
							fresh if this is a new gig.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={startFresh}>
							Start fresh
						</AlertDialogCancel>
						<AlertDialogAction onClick={keepResumed}>
							Continue
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<ShareWithFansModal
				open={shareOpen}
				onClose={() => setShareOpen(false)}
				title="Share with the room"
				code={fan.code}
				nowPlaying={song.name}
				position={`${index + 1} / ${songs.length}`}
				watching={fan.watching}
			/>

			{/* Chart — the hero, and now the *whole* screen above the peek bar. There is no
			    top bar and no song header: the title, artist and capo live on the peek bar,
			    which every player is already looking at to change song, so repeating them
			    here only cost rows of chart. The top inset padding is what the removed bar
			    used to absorb on a notched phone. */}
			<div
				ref={scrollRef}
				className="live-scroll min-h-0 flex-1 overflow-auto px-6 pb-4 pt-[calc(12px+env(safe-area-inset-top))]"
			>
				<SongSheet
					content={chart.content}
					capo={capo}
					view={view}
					transpose={transpose}
					collapseChoruses={display.collapseChoruses}
					hideSectionLabels
					lyricSize={Math.round(LIVE_LYRIC_SIZE * textScale)}
					chordSize={Math.round(LIVE_CHORD_SIZE * textScale)}
					gap={GAP_SCALES[display.gapIdx]}
					columns={display.columns}
				/>
			</div>

			{/* Peek bar — the fan view's pattern (CLAUDE.md §D10), band-facing and in the
			    app's own theme, and now the only chrome on the screen. What stays out here
			    is what a player touches *mid-song* with one thumb: prev/next, auto-scroll
			    (a runaway scroll has to be stoppable instantly) and the song itself, which
			    doubles as the way into the set. Everything you set *between* songs — capo
			    view, transpose, scroll speed, text size, sharing, leaving — is one tap away
			    behind the gear. From `lg` up there is room to keep capo inline as well. */}
			<div className="flex items-center gap-1 border-t border-border bg-card px-2 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5 sm:gap-1.5 sm:px-3">
				<IconBtn
					label="Previous song"
					disabled={index === 0}
					onClick={() => goTo(index - 1)}
				>
					<IconChevronLeft className="size-6" />
				</IconBtn>

				{/* What used to be two rows of chrome — the song's title, artist and capo —
				    is this one button, and tapping it opens the set, because "which song am
				    I on" and "which song next" are the same question. Capo carries the
				    accent: it is the one number here a player has to act on. */}
				<button
					type="button"
					onClick={() => setPanel("setlist")}
					aria-label="Setlist and search"
					aria-expanded={panel !== null}
					className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-0.5 text-left transition-colors hover:bg-secondary"
				>
					<span className="min-w-0 flex-1">
						<span className="block truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
							{position}
							{/* Position and capo always fit; the artist is the line's luxury, and
							    below `sm` there is no room for it beside five buttons. */}
							{artist && <span className="hidden sm:inline"> · {artist}</span>}
							{capo > 0 && (
								<span className="font-semibold text-primary">
									{" · "}
									CAPO {capo}
								</span>
							)}
						</span>
						<span className="block truncate font-display text-[15px] font-bold leading-tight sm:text-[17px]">
							{song.name}
						</span>
					</span>
				</button>

				{/* Wide screens have room to keep the between-song control a player reaches
				    for most out here as well; it stays in the drawer too, so a phone loses
				    nothing. */}
				<div className="hidden items-center gap-2 lg:flex">
					<CapoToggle value={view} onValueChange={setView} />
				</div>

				{/* The same checkbox the setlist panel carries, for the song on screen — so
				    "we've done this one" is one tap, without opening the drawer mid-set. */}
				<PlayedCheckbox
					checked={currentPlayed}
					label={song.name}
					onToggle={() => toggle(currentKey)}
					className={cn(
						"size-11 bg-secondary",
						currentPlayed && "text-primary",
					)}
				/>

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
					label="Show live controls"
					active={panel === "controls"}
					onClick={() => setPanel("controls")}
				>
					<IconSettings className="size-5" />
				</IconBtn>

				<IconBtn
					label="Next song"
					disabled={index >= songs.length - 1}
					onClick={() => goTo(index + 1)}
				>
					<IconChevronRight className="size-6" />
				</IconBtn>
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
								isPlayed={(at) => played.has(playedKey(songs[at], at))}
								onTogglePlayed={(at) => toggle(playedKey(songs[at], at))}
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
							{/* One control per row at phone width — a two-up row there wraps the
							    speed readout onto a second line. From `sm` up (a tablet in
							    landscape, a phone on its side) the two share a row, which is one
							    less row of drawer over the chart. */}
							<div className="flex flex-col gap-2 sm:flex-row">
								<TransposeControl
									label={transposeLabel}
									caption="transpose"
									onDown={() => setTranspose((t) => t - 1)}
									onUp={() => setTranspose((t) => t + 1)}
									className="w-full sm:flex-1"
								/>
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

							{/* Leaving is a between-song action if ever there was one, so it
							    lives here rather than as an X in a bar that no longer exists —
							    and the online light comes with it, since this is the panel a
							    player opens when something is not behaving. Exiting lands on the
							    setlist screen, which needs the network; with no signal, the
							    offline shelf instead. */}
							<div className="mt-1 flex items-center gap-2">
								<span className="inline-flex h-11 flex-none items-center gap-2 rounded-xl bg-secondary px-3">
									<span
										className="size-2 rounded-full"
										style={{ background: online ? "var(--ok)" : "#c0392b" }}
									/>
									<span className="font-mono text-[11px]">
										{online ? "Online" : "Offline"}
									</span>
								</span>
								{online ? (
									<Link
										to="/setlists/$id"
										params={{ id }}
										className={LEAVE_CLASS}
									>
										<IconX className="size-4" /> Leave Live Mode
									</Link>
								) : (
									<Link to="/offline" className={LEAVE_CLASS}>
										<IconX className="size-4" /> Leave Live Mode
									</Link>
								)}
							</div>
						</div>
					)}
				</DrawerContent>
			</Drawer>
		</div>
	);
}

/**
 * A square action on the peek bar; `active` marks a running toggle. One size for the whole
 * row, prev/next included — they used to be a size larger, which set the bar's height for
 * the sake of two buttons that are no harder to hit at 44px than anything else there.
 */
function IconBtn({
	children,
	label,
	active,
	disabled,
	onClick,
}: {
	children: React.ReactNode;
	label: string;
	active?: boolean;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={active}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"grid size-11 flex-none place-items-center rounded-xl transition-colors disabled:opacity-30",
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
