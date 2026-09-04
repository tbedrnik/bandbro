import { api } from "@frontend/api";
import { auth } from "@frontend/auth";
import { ImportSongButton } from "@frontend/components/ImportSongDialog";
import { MetaChip } from "@frontend/components/MetaChip";
import { NamePromptDialog } from "@frontend/components/NamePromptDialog";
import { OfflinePill } from "@frontend/components/OfflinePill";
import { Button } from "@frontend/components/ui/button";
import { useUser } from "@frontend/contexts/UserContext";
import { useOfflineSetlists, useOnline } from "@frontend/lib/offline";
import { useScopes } from "@frontend/lib/scopes";
import { displayKey } from "@shared/notation";
import { slugify } from "@shared/slug";
import {
	IconMusic,
	IconPlayerPlay,
	IconPlaylist,
	IconPlus,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_protected/")({
	component: HomePage,
});

function HomePage() {
	const user = useUser();
	const { bands, personal } = useScopes();
	const online = useOnline();
	const offlineSetlists = useOfflineSetlists();
	const { data: songs } = useQuery(api.songs.get.queryOptions({}));
	const recent = songs?.slice(0, 6) ?? [];
	const [bandDialogOpen, setBandDialogOpen] = useState(false);
	const [creatingBand, setCreatingBand] = useState(false);

	const createBand = async (name: string) => {
		setCreatingBand(true);
		try {
			await auth.organization.create({
				name,
				slug: `${slugify(name)}-${Date.now().toString(36)}`,
			});
			location.reload();
		} finally {
			setCreatingBand(false);
		}
	};

	return (
		<div className="mx-auto max-w-6xl px-6 py-10">
			{/* Wraps on a phone — the three actions are wider than a 390px screen next to
			    the greeting, and used to push "New song" off the right edge. */}
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div>
					<div className="flex items-center gap-3">
						<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
							Welcome back
						</div>
						{/* The signed-in name and bands come from the on-device session
						    snapshot when there's no signal — say so rather than letting the
						    page look like a normal, fully-loaded home screen. */}
						{!online && (
							<OfflinePill label="Offline" detail="working from this device" />
						)}
					</div>
					<h1 className="mt-1 font-display text-3xl font-bold">
						Evening, {user.name}.
					</h1>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button variant="outline" render={<Link to="/library" />}>
						<IconMusic className="size-4" /> Library
					</Button>
					{/* Writing a song ends in a POST, so with no signal the button would only
					    lead to an editor that can't save (§D7). ImportSongButton hides itself. */}
					<ImportSongButton />
					{online && (
						<Button render={<Link to="/songs/new" />}>
							<IconPlus className="size-4" /> New song
						</Button>
					)}
				</div>
			</div>

			{offlineSetlists.length > 0 && (
				<section className="mt-8">
					<div className="mb-3 flex items-center justify-between">
						<h2 className="font-display text-lg font-semibold">
							Available offline
						</h2>
						<Link
							to="/offline"
							className="text-sm text-primary hover:underline"
						>
							Manage downloads →
						</Link>
					</div>
					<div className="flex flex-wrap gap-3">
						{offlineSetlists.slice(0, 4).map((s) => (
							<Link
								key={s.id}
								to="/live/$id"
								params={{ id: s.id }}
								className="flex min-w-56 flex-1 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary"
							>
								<IconPlaylist className="size-5 text-primary" />
								<div className="min-w-0 flex-1">
									<div className="truncate font-display font-medium">
										{s.title}
									</div>
									<div className="font-mono text-xs text-muted-foreground">
										{s.songCount} songs · on this device
									</div>
								</div>
								<IconPlayerPlay className="size-4 text-muted-foreground" />
							</Link>
						))}
					</div>
				</section>
			)}

			<div className="mt-10 grid gap-8 lg:grid-cols-[1fr_280px]">
				<section>
					<div className="mb-3 flex items-center justify-between">
						<h2 className="font-display text-lg font-semibold">Recent songs</h2>
						<Link
							to="/library"
							className="text-sm text-primary hover:underline"
						>
							Open library →
						</Link>
					</div>
					<div className="overflow-hidden rounded-xl border border-border">
						{recent.length === 0 ? (
							<div className="px-4 py-10 text-center text-sm text-muted-foreground">
								{online
									? "No songs yet — fork one from the curated library or write your own."
									: "You're offline — the library needs a connection. Your downloaded setlists are above."}
							</div>
						) : (
							recent.map((song) => {
								const chart = song.charts[0];
								const artist = song.credits
									.map((c) => c.artist.name)
									.join(", ");
								return (
									<Link
										key={song.id}
										to="/songs/$slug"
										params={{ slug: song.slug }}
										className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-card/60"
									>
										<IconMusic className="size-4 text-primary" />
										<div className="flex-1">
											<div className="font-display font-medium">
												{song.name}
											</div>
											<div className="text-xs text-muted-foreground">
												{artist || "—"} · {song.organization?.name ?? "Curated"}
											</div>
										</div>
										{chart?.key && (
											<MetaChip
												label=""
												value={displayKey(chart.key)}
												className="px-2 py-1"
											/>
										)}
									</Link>
								);
							})
						)}
					</div>
				</section>

				<aside>
					<div className="mb-3 flex items-center justify-between">
						<h2 className="font-display text-lg font-semibold">Your bands</h2>
						<Link to="/bands" className="text-sm text-primary hover:underline">
							Manage
						</Link>
					</div>
					<div className="flex flex-col gap-2">
						{!online && bands.length === 0 && !personal && (
							<p className="text-sm text-muted-foreground">
								You're offline — your bands are read from the server.
							</p>
						)}
						{[...bands, ...(personal ? [personal] : [])].map((scope) => (
							<div
								key={scope.param}
								className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
							>
								<div className="grid size-9 place-items-center rounded-lg bg-accent-wash font-display text-sm font-bold text-primary">
									{scope.name.slice(0, 2).toUpperCase()}
								</div>
								<div className="font-display text-sm font-medium">
									{scope.name}
								</div>
							</div>
						))}
						{online && (
							<Button
								variant="outline"
								className="mt-1 justify-start"
								onClick={() => setBandDialogOpen(true)}
							>
								<IconPlus className="size-4" /> Create a band
							</Button>
						)}
					</div>
				</aside>
			</div>

			<NamePromptDialog
				open={bandDialogOpen}
				onOpenChange={setBandDialogOpen}
				title="Create a band"
				description="A shared workspace for your bandmates — you'll be its admin."
				label="Band name"
				placeholder="The Anchor Sessions"
				submitLabel="Create band"
				pending={creatingBand}
				onSubmit={createBand}
			/>
		</div>
	);
}
