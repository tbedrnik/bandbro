import { CapoToggle, type ChordView } from "@frontend/components/CapoToggle";
import { type ChordBlock, ChordSheet } from "@frontend/components/ChordSheet";
import { MetaChip, Tag } from "@frontend/components/MetaChip";
import { OfflinePill } from "@frontend/components/OfflinePill";
import { RoleBadge } from "@frontend/components/RoleBadge";
import { TransposeStepper } from "@frontend/components/TransposeStepper";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { parseChordpro } from "@shared/chordpro";
import { IconCheck } from "@tabler/icons-react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/design")({
	component: DesignSystemPage,
});

const SAMPLE_BLOCKS: ChordBlock[] = [
	{
		label: "Verse 1",
		lines: [
			[
				{ chord: "Am", text: "There is a " },
				{ chord: "C", text: "house in " },
				{ chord: "D", text: "New Or" },
				{ chord: "F", text: "leans" },
			],
			[
				{ chord: "", text: "They " },
				{ chord: "Am", text: "call the " },
				{ chord: "C", text: "Rising " },
				{ chord: "E", text: "Sun" },
			],
		],
	},
	{
		label: "Chorus",
		lines: [
			[
				{ chord: "", text: "Oh " },
				{ chord: "Am", text: "mother, " },
				{ chord: "C", text: "tell your " },
				{ chord: "D", text: "chil" },
				{ chord: "F", text: "dren" },
			],
			[
				{ chord: "", text: "Not to " },
				{ chord: "Am", text: "do what " },
				{ chord: "C", text: "I have " },
				{ chord: "E", text: "done" },
			],
		],
	},
];

// Tabs come out of the parser, not hand-written blocks: their columns are the whole
// point, so the showcase renders the real ChordPro → ChordSheet path.
const TAB_BLOCKS: ChordBlock[] = parseChordpro(
	[
		"{start_of_tab: Intro}",
		"   [Am]           [C]",
		"e|-----0-----------0-----|",
		"H|---1---1-------1---1---|",
		"G|-2-------2---0-------0-|",
		"D|-----------2-----------|",
		"A|-0-----------3---------|",
		"E|-----------------------|",
		"{end_of_tab}",
	].join("\n"),
).blocks;

const SWATCHES: { name: string; cssVar: string }[] = [
	{ name: "bg", cssVar: "--background" },
	{ name: "surface", cssVar: "--card" },
	{ name: "surface-2", cssVar: "--surface-2" },
	{ name: "accent", cssVar: "--primary" },
	{ name: "ink", cssVar: "--foreground" },
	{ name: "muted", cssVar: "--muted-foreground" },
	{ name: "border", cssVar: "--border" },
	{ name: "accent-wash", cssVar: "--accent-wash" },
];

const HEXES: Record<"light" | "dark", string[]> = {
	light: [
		"#ffffff",
		"#f5f7f9",
		"#eef1f5",
		"#c2711a",
		"#161a1f",
		"#5b6470",
		"#e6eaef",
		"rgba(194,113,26,0.10)",
	],
	dark: [
		"#16181c",
		"#1d2025",
		"#23262c",
		"#e8a13a",
		"#edeef0",
		"#8b8f96",
		"#2c3037",
		"rgba(232,161,58,0.16)",
	],
};

function Kicker({ children }: { children: React.ReactNode }) {
	return (
		<div className="mb-3.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
			{children}
		</div>
	);
}

function DesignBoard({ theme }: { theme: "light" | "dark" }) {
	const [capoA, setCapoA] = useState<ChordView>("fingered");
	const [capoB, setCapoB] = useState<ChordView>("concert");

	return (
		<div className="rounded-[18px] bg-background px-[30px] pt-[30px] pb-[34px] text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.10)]">
			{/* Color tokens */}
			<section className="mb-[34px]">
				<Kicker>Color tokens</Kicker>
				<div className="grid grid-cols-4 gap-2.5">
					{SWATCHES.map((s, i) => (
						<div key={s.name}>
							<div
								className="h-[52px] rounded-[9px] shadow-[inset_0_0_0_1px_var(--border)]"
								style={{ background: `var(${s.cssVar})` }}
							/>
							<div className="mt-1.5 font-mono text-[10.5px] text-foreground">
								{s.name}
							</div>
							<div className="font-mono text-[10px] text-muted-foreground">
								{HEXES[theme][i]}
							</div>
						</div>
					))}
				</div>
			</section>

			{/* Typography */}
			<section className="mb-[34px]">
				<Kicker>Typography</Kicker>
				<div className="flex flex-col gap-3.5">
					<div className="flex items-baseline justify-between gap-4 border-b border-border pb-3.5">
						<span className="font-display text-[32px] font-bold tracking-[-0.025em]">
							Rising Sun
						</span>
						<span className="text-right font-mono text-[11px] text-muted-foreground">
							Space Grotesk
							<br />
							700 · display
						</span>
					</div>
					<div className="flex items-baseline justify-between gap-4 border-b border-border pb-3.5">
						<span className="text-[17px]">
							Lyrics and interface body text stays calm and readable.
						</span>
						<span className="shrink-0 text-right font-mono text-[11px] text-muted-foreground">
							IBM Plex Sans
							<br />
							400 · body
						</span>
					</div>
					<div className="flex items-baseline justify-between gap-4">
						<span className="font-mono text-[16px] font-semibold tracking-[0.04em] text-primary">
							Am C D F E7
						</span>
						<span className="shrink-0 text-right font-mono text-[11px] text-muted-foreground">
							IBM Plex Mono
							<br />
							600 · chords
						</span>
					</div>
				</div>
			</section>

			{/* Chord sheet hero */}
			<section className="mb-[34px]">
				<Kicker>Chord sheet — the hero</Kicker>
				<div className="rounded-xl border border-border bg-card px-6 py-[22px]">
					<ChordSheet blocks={SAMPLE_BLOCKS} lyricSize={20} chordSize={14} />
				</div>
			</section>

			{/* Tab — verbatim monospace grid */}
			<section className="mb-[34px]">
				<Kicker>Tab — verbatim, monospace, tight-leaded</Kicker>
				<div className="rounded-xl border border-border bg-card px-6 py-[22px]">
					<ChordSheet blocks={TAB_BLOCKS} lyricSize={20} chordSize={14} />
				</div>
			</section>

			{/* Capo / Concert toggle */}
			<section className="mb-[34px]">
				<Kicker>Capo / Concert toggle — signature control</Kicker>
				<div className="flex flex-wrap gap-3.5">
					<CapoToggle
						value={capoA}
						onValueChange={setCapoA}
						caption="capo player default"
					/>
					<CapoToggle
						value={capoB}
						onValueChange={setCapoB}
						caption="bass / keys default"
					/>
				</div>
			</section>

			{/* Transpose */}
			<section className="mb-[34px]">
				<Kicker>Transpose stepper</Kicker>
				<TransposeStepper
					value="Am"
					onStepUp={() => {}}
					onStepDown={() => {}}
				/>
			</section>

			{/* Buttons */}
			<section className="mb-[34px]">
				<Kicker>Buttons</Kicker>
				<div className="flex flex-wrap items-center gap-2.5">
					<Button size="lg">Primary</Button>
					<Button size="lg" variant="solid">
						Solid
					</Button>
					<Button size="lg" variant="outline">
						Secondary
					</Button>
					<Button size="lg" variant="dashed">
						<span className="text-[17px]">+</span> Dashed
					</Button>
				</div>
			</section>

			{/* Chips & input */}
			<section className="mb-[34px]">
				<Kicker>Meta chips, tags & input</Kicker>
				<div className="mb-3.5 flex flex-wrap gap-2">
					<MetaChip label="key" value="Am" />
					<MetaChip label="capo" value="2" />
					<Tag>folk</Tag>
					<Tag>slow</Tag>
				</div>
				<Input placeholder="Search title, artist or lyrics" className="h-11" />
			</section>

			{/* Members & roles */}
			<section className="mb-[34px]">
				<Kicker>Member & role badges</Kicker>
				<div className="flex flex-col gap-3">
					{[
						{ initials: "Y", name: "You", role: "Admin" as const, me: true },
						{ initials: "MO", name: "Maya Okonkwo", role: "Writer" as const },
						{ initials: "SR", name: "Sam Rivera", role: "Reader" as const },
					].map((m) => (
						<div key={m.name} className="flex items-center gap-3">
							<span
								className={`flex size-[38px] items-center justify-center rounded-full font-display text-sm font-semibold ${
									m.me
										? "bg-foreground text-background"
										: "bg-secondary text-muted-foreground"
								}`}
							>
								{m.initials}
							</span>
							<span className="flex-1 font-display text-sm font-semibold text-foreground">
								{m.name}
							</span>
							<RoleBadge role={m.role} />
						</div>
					))}
				</div>
			</section>

			{/* Status: toast & offline */}
			<section>
				<Kicker>Status: toast & offline</Kicker>
				<div className="flex flex-col gap-3">
					<span className="inline-flex items-center gap-2.5 self-start rounded-[11px] bg-foreground px-[18px] py-3 text-[13.5px] font-medium text-background">
						<IconCheck className="size-4 text-primary" />
						Forked into The Anchor Sessions
					</span>
					<OfflinePill className="self-start" />
				</div>
			</section>
		</div>
	);
}

function DesignSystemPage() {
	return (
		<div className="min-h-screen bg-[#e9e9ec] font-sans text-[#161a1f]">
			<header className="mx-auto max-w-[1320px] px-8 pt-10 pb-2">
				<div className="flex items-baseline gap-3.5">
					<span className="font-display text-2xl font-bold tracking-[-0.02em]">
						Band<span className="text-[#c2711a]">Bro</span>
					</span>
					<span className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#5b6470]">
						Design System
					</span>
				</div>
				<p className="mt-3.5 max-w-[680px] text-[15px] leading-relaxed text-[#5b6470]">
					The atomic components that make up BandBro, shown in both themes.
					Everything is driven by the same token set — a single accent (warm
					amber), neutral surfaces, and the IBM&nbsp;Plex / Space&nbsp;Grotesk
					pairing chosen for legibility across a room.
				</p>
			</header>

			<div className="mx-auto grid max-w-[1320px] grid-cols-2 gap-7 px-8 pt-7">
				<div className="flex items-center gap-2.5">
					<span className="size-[13px] rounded-full bg-[#c2711a] shadow-[0_0_0_4px_rgba(194,113,26,0.10)]" />
					<span className="font-display text-[17px] font-semibold">Light</span>
					<span className="font-mono text-[11.5px] text-[#7a7f87]">
						desktop authoring
					</span>
				</div>
				<div className="flex items-center gap-2.5">
					<span className="size-[13px] rounded-full bg-[#e8a13a] shadow-[0_0_0_4px_rgba(232,161,58,0.16)]" />
					<span className="font-display text-[17px] font-semibold">Dark</span>
					<span className="font-mono text-[11.5px] text-[#7a7f87]">
						stage / Live mode
					</span>
				</div>
			</div>

			<div className="mx-auto grid max-w-[1320px] grid-cols-2 items-start gap-7 px-8 pt-3.5 pb-20">
				<DesignBoard theme="light" />
				<div className="dark">
					<DesignBoard theme="dark" />
				</div>
			</div>
		</div>
	);
}
