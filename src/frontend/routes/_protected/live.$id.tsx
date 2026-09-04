import { api } from "@frontend/api";
import { CapoToggle } from "@frontend/components/CapoToggle";
import { DisplaySettings } from "@frontend/components/DisplaySettings";
import { ShareWithFansModal } from "@frontend/components/ShareWithFansModal";
import { SongSheet } from "@frontend/components/SongSheet";
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
import { displayKey } from "@shared/notation";
import type { ChordView } from "@shared/transpose";
import { transposeKey } from "@shared/transpose";
import {
	IconChevronLeft,
	IconChevronRight,
	IconMinus,
	IconPlayerPause,
	IconPlayerPlay,
	IconPlus,
	IconShare3,
	IconTextSize,
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
	const [displayOpen, setDisplayOpen] = useState(false);
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

	return (
		<div className="flex h-dvh flex-col bg-background text-foreground">
			{/* Top bar */}
			<div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
				<span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1">
					<span
						className="size-2 rounded-full"
						style={{ background: online ? "var(--ok)" : "#c0392b" }}
					/>
					<span className="font-mono text-xs">
						{online ? "Online" : "Offline"}
					</span>
				</span>
				<span className="truncate font-display text-sm text-muted-foreground">
					{setlist.title} · {index + 1}/{songs.length}
				</span>
				{/* Sharing is the one control here that genuinely needs the network —
				    the fan view is served, not cached. Disable it rather than hand the
				    band a share sheet with no code in it. */}
				<button
					type="button"
					disabled={!online}
					onClick={() => {
						fan.ensure();
						setShareOpen(true);
					}}
					className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 font-display text-[13px] font-semibold text-primary-foreground disabled:opacity-40"
				>
					<IconShare3 className="size-4" /> Share with fans
				</button>
				<Link
					to="/setlists/$id"
					params={{ id }}
					className="grid size-8 place-items-center rounded-lg hover:bg-muted"
					aria-label="Exit live mode"
				>
					<IconX className="size-5" />
				</Link>
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

			{/* Controls */}
			<div className="relative border-t border-border px-4 py-3">
				{displayOpen && (
					<>
						{/* Tap-away closer — the panel sits over the chart, so it must not swallow
						    the whole screen's next tap silently. */}
						<button
							type="button"
							aria-label="Close display settings"
							onClick={() => setDisplayOpen(false)}
							className="fixed inset-0 z-40 cursor-default"
						/>
						<div className="absolute bottom-full right-4 z-50 mb-2">
							<DisplaySettings
								value={display}
								onChange={setDisplay}
								fitScale={fitScale}
							/>
						</div>
					</>
				)}
				<div className="flex items-center justify-between gap-3">
					<BigBtn
						label="Prev"
						disabled={index === 0}
						onClick={() => setIndex((i) => Math.max(0, i - 1))}
					>
						<IconChevronLeft className="size-7" />
					</BigBtn>

					<div className="flex items-center gap-2">
						<CapoToggle value={view} onValueChange={setView} />
						<div className="flex items-center gap-1 rounded-xl bg-secondary p-1">
							<SmallBtn
								onClick={() => setTranspose((t) => t - 1)}
								label="Transpose down"
							>
								<IconMinus className="size-4" />
							</SmallBtn>
							<span className="w-10 text-center font-mono text-sm">
								{displayedKey || (transpose >= 0 ? `+${transpose}` : transpose)}
							</span>
							<SmallBtn
								onClick={() => setTranspose((t) => t + 1)}
								label="Transpose up"
							>
								<IconPlus className="size-4" />
							</SmallBtn>
						</div>
						<div className="flex items-center gap-1 rounded-xl bg-secondary p-1">
							<SmallBtn
								onClick={() => setScrolling((s) => !s)}
								label="Toggle auto-scroll"
							>
								{scrolling ? (
									<IconPlayerPause className="size-4" />
								) : (
									<IconPlayerPlay className="size-4" />
								)}
							</SmallBtn>
							<SmallBtn
								onClick={() => setSpeed((s) => Math.max(1, s - 1))}
								label="Slower"
							>
								<IconMinus className="size-4" />
							</SmallBtn>
							<span className="w-6 text-center font-mono text-xs">{speed}</span>
							<SmallBtn
								onClick={() => setSpeed((s) => Math.min(8, s + 1))}
								label="Faster"
							>
								<IconPlus className="size-4" />
							</SmallBtn>
						</div>
						<button
							type="button"
							aria-label="Display settings"
							aria-expanded={displayOpen}
							onClick={() => setDisplayOpen((o) => !o)}
							className={`grid size-11 place-items-center rounded-xl transition-colors ${
								displayOpen
									? "bg-primary text-primary-foreground"
									: "bg-secondary hover:bg-muted"
							}`}
						>
							<IconTextSize className="size-5" />
						</button>
					</div>

					<BigBtn
						label="Next"
						disabled={index >= songs.length - 1}
						onClick={() => setIndex((i) => Math.min(songs.length - 1, i + 1))}
					>
						<IconChevronRight className="size-7" />
					</BigBtn>
				</div>
				{next && (
					<div className="mt-2 text-center font-mono text-xs text-muted-foreground">
						up next · {next.chart.song.name}
					</div>
				)}
			</div>
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
			className="grid size-14 place-items-center rounded-2xl bg-card shadow-sm transition-colors hover:bg-muted disabled:opacity-30"
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
			className="grid size-9 place-items-center rounded-lg bg-background transition-colors hover:bg-muted"
		>
			{children}
		</button>
	);
}
