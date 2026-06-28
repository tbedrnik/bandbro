import { api } from "@frontend/api";
import { CapoToggle } from "@frontend/components/CapoToggle";
import { MetaChip, Tag } from "@frontend/components/MetaChip";
import { SongSheet } from "@frontend/components/SongSheet";
import { TransposeStepper } from "@frontend/components/TransposeStepper";
import { Button } from "@frontend/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@frontend/components/ui/dropdown-menu";
import { useUser } from "@frontend/contexts/UserContext";
import { useScopes } from "@frontend/lib/scopes";
import type { ChordView } from "@shared/transpose";
import { transposeKey } from "@shared/transpose";
import { IconBulb, IconGitFork, IconPencil } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_protected/songs/$slug")({
	component: SongViewPage,
});

function SongViewPage() {
	const { slug } = Route.useParams();
	const user = useUser();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { bands, personal } = useScopes();

	const {
		data: song,
		isPending,
		error,
	} = useQuery(api.songs({ slug }).get.queryOptions({}));

	const [view, setView] = useState<ChordView>(
		(user.defaultChordView as ChordView) ?? "fingered",
	);
	const [transpose, setTranspose] = useState(0);

	const chart = song?.charts[0];
	const capo = chart?.capo ?? 0;
	const writableScopes = [...bands, ...(personal ? [personal] : [])];

	const fork = useMutation({
		...api.songs({ slug }).fork.post.mutationOptions(),
		onSuccess: (created) => {
			queryClient.invalidateQueries(api.songs.get.queryFilter());
			navigate({ to: "/songs/$slug", params: { slug: created.slug } });
		},
	});

	const displayedKey = useMemo(() => {
		if (!chart?.key) return "";
		const steps = (view === "concert" ? capo : 0) + transpose;
		return transposeKey(chart.key, steps);
	}, [chart?.key, view, capo, transpose]);

	if (isPending) return <Centered>Loading…</Centered>;
	if (error || !song || !chart) return <Centered>Song not found.</Centered>;

	const artist = song.credits.map((c) => c.artist.name).join(", ");

	return (
		<div className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[1fr_300px]">
			{/* Chart — the hero */}
			<article className="order-2 lg:order-1">
				<header className="mb-6 border-b border-border pb-5">
					{song.forkedFrom && (
						<div className="mb-2 font-mono text-xs text-muted-foreground">
							forked from {song.forkedFrom.organization?.name ?? "Curated"}
						</div>
					)}
					<h1 className="font-display text-3xl font-bold">{song.name}</h1>
					{artist && <p className="mt-1 text-muted-foreground">{artist}</p>}
					<div className="mt-4 flex flex-wrap items-center gap-2">
						{displayedKey && <MetaChip label="Key" value={displayedKey} />}
						{capo > 0 && <MetaChip label="Capo" value={capo} />}
						{chart.tempo && (
							<MetaChip label="Tempo" value={`${chart.tempo} bpm`} />
						)}
						{chart.timeSignature && (
							<MetaChip label="Time" value={chart.timeSignature} />
						)}
						{song.tags.map((t) => (
							<Tag key={t.tag.id}>{t.tag.name}</Tag>
						))}
					</div>
				</header>
				<SongSheet
					content={chart.content}
					capo={capo}
					view={view}
					transpose={transpose}
				/>
			</article>

			{/* Controls */}
			<aside className="order-1 flex flex-col gap-6 lg:order-2">
				<div>
					<div className="mb-2 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Chord view
					</div>
					<CapoToggle
						value={view}
						onValueChange={setView}
						caption={capo > 0 ? `capo ${capo} active` : "no capo"}
					/>
				</div>
				<div>
					<div className="mb-2 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Transpose
					</div>
					<TransposeStepper
						value={displayedKey || "—"}
						caption={
							transpose === 0
								? "original"
								: transpose > 0
									? `+${transpose}`
									: `${transpose}`
						}
						onStepUp={() => setTranspose((t) => t + 1)}
						onStepDown={() => setTranspose((t) => t - 1)}
					/>
					{transpose !== 0 && (
						<button
							type="button"
							onClick={() => setTranspose(0)}
							className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
						>
							Reset to original
						</button>
					)}
				</div>
				<div className="flex flex-col gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button disabled={fork.isPending || !writableScopes.length}>
									<IconGitFork className="size-4" />
									{fork.isPending ? "Forking…" : "Fork to my library"}
								</Button>
							}
						/>
						<DropdownMenuContent>
							{writableScopes.map((s) => (
								<DropdownMenuItem
									key={s.param}
									onClick={() =>
										s.id && fork.mutate({ targetOrganizationId: s.id })
									}
								>
									{s.name}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>

					{song.viewerCanWrite ? (
						<Button
							variant="outline"
							render={<Link to="/songs/$slug/edit" params={{ slug }} />}
						>
							<IconPencil className="size-4" /> Edit
						</Button>
					) : (
						<Button
							variant="outline"
							render={
								<Link
									to="/songs/$slug/edit"
									params={{ slug }}
									search={{ suggest: true }}
								/>
							}
						>
							<IconBulb className="size-4" /> Suggest an edit
						</Button>
					)}
				</div>
				<p className="text-xs text-muted-foreground">
					You can read &amp; transpose this song.{" "}
					{song.viewerCanWrite
						? "You have write access here."
						: "Suggest proposes an edit to the band's writers."}
				</p>
			</aside>
		</div>
	);
}

function Centered({ children }: { children: React.ReactNode }) {
	return (
		<div className="grid min-h-[60vh] place-items-center text-muted-foreground">
			{children}
		</div>
	);
}
