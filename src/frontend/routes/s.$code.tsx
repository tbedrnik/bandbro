import { api } from "@frontend/api";
import { SongSheet } from "@frontend/components/SongSheet";
import { Drawer, DrawerContent, DrawerTitle } from "@frontend/components/ui/drawer";
import { getClientId } from "@frontend/lib/fanSession";
import { FAN_SIZES, type FanTheme, fanPalette } from "@frontend/lib/fanTheme";
import { transposeKey } from "@shared/transpose";
import {
	IconChevronUp,
	IconMinus,
	IconMoon,
	IconPlus,
	IconSun,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/s/$code")({
	component: FanLiveView,
});

const POLL_MS = 4000;

/**
 * Public, read-only fan live view — "Now Playing" direction (CLAUDE.md fan-experience
 * handoff, screen 1c). No auth, no top chrome: the lyrics get the full screen with a subtle
 * accent glow. A persistent bottom "Now Playing" bar (band · venue + song title) opens a
 * bottom drawer (shadcn `Drawer`) that holds every control. It auto-follows whichever song the
 * band is on — a transient "Now playing" pill flashes on each change. All view controls
 * (lyrics⇄chords, size, theme, transpose) are local to this device.
 */
function FanLiveView() {
	const { code } = Route.useParams();
	const clientId = useRef(getClientId()).current;

	const { data, isPending, isError } = useQuery({
		...api.live({ code: code.toUpperCase() }).get.queryOptions({ clientId }),
		refetchInterval: POLL_MS,
		retry: false,
	});

	// Per-device view state.
	const [chords, setChords] = useState(false);
	const [sizeIdx, setSizeIdx] = useState(1);
	const [theme, setTheme] = useState<FanTheme>("dark");
	const [transpose, setTranspose] = useState(0);
	const [open, setOpen] = useState(false);

	// Auto-follow: flash a "Now playing" pill whenever the band advances the set.
	const [flash, setFlash] = useState(false);
	const prevIndex = useRef<number | null>(null);
	const currentIndex = data?.currentSongIndex ?? 0;
	useEffect(() => {
		if (!data) return;
		if (prevIndex.current !== null && prevIndex.current !== currentIndex) {
			setFlash(true);
			const t = setTimeout(() => setFlash(false), 2600);
			setTranspose(0);
			return () => clearTimeout(t);
		}
		prevIndex.current = currentIndex;
	}, [currentIndex, data]);

	if (isPending) {
		return (
			<div
				className="grid min-h-dvh place-items-center font-mono text-sm"
				style={{ background: "#17140e", color: "#9d9281" }}
			>
				Joining the session…
			</div>
		);
	}
	if (isError || !data) {
		return (
			<div
				className="grid min-h-dvh place-items-center px-8 text-center font-sans"
				style={{ background: "#17140e", color: "#efe9dc" }}
			>
				<div>
					<div className="font-display text-[22px] font-bold">
						Session not found
					</div>
					<p className="mt-2 text-[13.5px]" style={{ color: "#9d9281" }}>
						This show has ended, or the code{" "}
						<span className="font-mono">{code.toUpperCase()}</span> is wrong.
					</p>
				</div>
			</div>
		);
	}

	const song = data.songs[currentIndex];
	const f = FAN_SIZES[sizeIdx];
	const lyricSize = Math.round(24 * f);
	const chordSize = Math.round(16 * f);
	const displayedKey = song ? transposeKey(song.key, transpose) : "";
	const palette = fanPalette(theme);
	const eyebrow = `${data.band} · ${data.title}`;

	return (
		<div
			className="relative flex h-dvh flex-col overflow-hidden bg-background font-sans text-foreground"
			style={palette}
		>
			{/* Subtle radial accent glow from the top */}
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"radial-gradient(120% 70% at 50% -8%, var(--accent-wash), transparent 55%)",
				}}
			/>

			{flash && (
				<div
					className="fixed left-1/2 top-3 z-[60] whitespace-nowrap rounded-full bg-primary px-3.5 py-[7px] font-mono text-[11px] font-semibold text-primary-foreground"
					style={{
						animation: "fan-flash 2.6s ease forwards",
						boxShadow: "0 10px 22px -7px rgba(0,0,0,0.5)",
					}}
				>
					♫ Now playing · {song?.title}
				</div>
			)}

			{/* Immersive song body — the hero, full screen */}
			<div
				className="fan-scroll relative z-10 min-h-0 flex-1 overflow-y-auto px-6 pt-8"
				style={{ paddingBottom: "calc(120px + env(safe-area-inset-bottom))" }}
			>
				{song && (
					<SongSheet
						content={song.content}
						capo={0}
						view="fingered"
						transpose={transpose}
						hideChords={!chords}
						align={chords ? "left" : "center"}
						lyricSize={lyricSize}
						chordSize={chordSize}
					/>
				)}
			</div>

			{/* Persistent "Now Playing" bar — the collapsed drawer; tap to open the controls */}
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label="Show controls"
				className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-[18px] pb-[calc(14px+env(safe-area-inset-bottom))] pt-[9px] text-left"
				style={{
					...palette,
					borderTopLeftRadius: 20,
					borderTopRightRadius: 20,
					boxShadow: "0 -10px 28px -16px rgba(0,0,0,0.6)",
				}}
			>
				<div className="mx-auto mb-[11px] h-1 w-9 rounded-full bg-border" />
				<div className="flex items-center gap-3">
					<div className="min-w-0 flex-1">
						<div className="mb-[3px] truncate font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
							{eyebrow}
						</div>
						<div className="truncate font-display text-[18px] font-bold leading-[1.1] tracking-[-0.01em]">
							{song?.title}
						</div>
					</div>
					<IconChevronUp className="size-4 flex-none text-muted-foreground" />
				</div>
			</button>

			<Drawer open={open} onOpenChange={setOpen}>
				<DrawerContent
					style={palette}
					className="border-border bg-card text-foreground"
				>
					{/* Header — mirrors the collapsed bar; chevron points down to close */}
					<button
						type="button"
						onClick={() => setOpen(false)}
						aria-label="Hide controls"
						className="w-full px-[18px] pb-2 pt-[9px] text-left"
					>
						<div className="mx-auto mb-[11px] h-1 w-9 rounded-full bg-border" />
						<div className="flex items-center gap-3">
							<div className="min-w-0 flex-1">
								<div className="mb-[3px] truncate font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
									{eyebrow}
								</div>
								<DrawerTitle className="truncate font-display text-[18px] font-bold leading-[1.1] tracking-[-0.01em]">
									{song?.title}
								</DrawerTitle>
							</div>
							<IconChevronUp
								className="size-4 flex-none rotate-180 text-muted-foreground"
							/>
						</div>
					</button>

					<div className="px-4 pb-[calc(18px+env(safe-area-inset-bottom))] pt-1">
						<div className="mb-[11px] flex items-center gap-[7px]">
							<span
								className="size-[7px] rounded-full bg-primary"
								style={{ animation: "fan-pulse 1.6s ease-in-out infinite" }}
							/>
							<span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
								Following live
							</span>
							<span className="flex-1" />
							<span className="flex items-center gap-[5px]">
								{data.songs.map((_, i) => (
									<span
										// biome-ignore lint/suspicious/noArrayIndexKey: positional setlist dots
										key={i}
										className={`size-1.5 rounded-full ${
											i === currentIndex ? "bg-primary" : "bg-border"
										}`}
									/>
								))}
							</span>
						</div>

						<div className="mb-2 flex gap-1 rounded-[11px] bg-secondary p-1">
							<SegBtn active={!chords} onClick={() => setChords(false)}>
								Lyrics
							</SegBtn>
							<SegBtn active={chords} onClick={() => setChords(true)}>
								Lyrics + Chords
							</SegBtn>
						</div>
						<div className="flex gap-2">
							<div className="flex h-[42px] flex-1 items-center justify-between rounded-[10px] bg-secondary px-1">
								<CtrlBtn
									label="Smaller text"
									onClick={() => setSizeIdx((i) => Math.max(0, i - 1))}
								>
									<span className="text-[13px] font-bold">A</span>
								</CtrlBtn>
								<span className="font-mono text-[9.5px] tracking-[0.08em] text-muted-foreground">
									SIZE
								</span>
								<CtrlBtn
									label="Bigger text"
									onClick={() =>
										setSizeIdx((i) => Math.min(FAN_SIZES.length - 1, i + 1))
									}
								>
									<span className="text-[20px] font-bold">A</span>
								</CtrlBtn>
							</div>
							<button
								type="button"
								aria-label="Toggle theme"
								onClick={() =>
									setTheme((t) => (t === "dark" ? "light" : "dark"))
								}
								className="grid size-[42px] flex-none place-items-center rounded-[10px] bg-secondary text-foreground"
							>
								{theme === "dark" ? (
									<IconSun className="size-[18px]" />
								) : (
									<IconMoon className="size-[18px]" />
								)}
							</button>
							<div className="flex h-[42px] flex-1 items-center justify-between rounded-[10px] bg-secondary px-1">
								<CtrlBtn
									label="Transpose down"
									onClick={() => setTranspose((t) => Math.max(-11, t - 1))}
								>
									<IconMinus className="size-[18px]" />
								</CtrlBtn>
								<div className="text-center leading-none">
									<div className="font-mono text-[14px] font-semibold">
										{displayedKey ||
											(transpose >= 0 ? `+${transpose}` : transpose)}
									</div>
									<div className="text-[8px] tracking-[0.08em] text-muted-foreground">
										KEY
									</div>
								</div>
								<CtrlBtn
									label="Transpose up"
									onClick={() => setTranspose((t) => Math.min(11, t + 1))}
								>
									<IconPlus className="size-[18px]" />
								</CtrlBtn>
							</div>
						</div>

						<div className="mt-[11px] flex items-center justify-between gap-2.5 border-t border-border pb-1 pt-[11px]">
							<div className="min-w-0">
								<div className="text-[11px] text-muted-foreground">
									Enjoying the set?
								</div>
								<div className="truncate font-display text-[13px] font-semibold">
									Follow {data.band}
								</div>
							</div>
							<button
								type="button"
								className="flex h-[38px] flex-none items-center gap-1.5 rounded-[10px] bg-primary px-[15px] font-display text-[13px] font-semibold text-primary-foreground"
							>
								♥ Tip the band
							</button>
						</div>
					</div>
				</DrawerContent>
			</Drawer>
		</div>
	);
}

function SegBtn({
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
			className={`h-[38px] flex-1 rounded-lg font-display text-[13px] font-semibold transition-colors ${
				active
					? "bg-primary text-primary-foreground shadow-sm"
					: "bg-transparent text-muted-foreground"
			}`}
		>
			{children}
		</button>
	);
}

function CtrlBtn({
	label,
	onClick,
	children,
}: {
	label: string;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onClick}
			className="grid h-[34px] w-8 place-items-center rounded-lg text-foreground"
		>
			{children}
		</button>
	);
}
