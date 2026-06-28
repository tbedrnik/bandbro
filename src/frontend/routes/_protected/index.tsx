import { api } from "@frontend/api";
import { auth } from "@frontend/auth";
import { MetaChip } from "@frontend/components/MetaChip";
import { Button } from "@frontend/components/ui/button";
import { useUser } from "@frontend/contexts/UserContext";
import { useScopes } from "@frontend/lib/scopes";
import { IconMusic, IconPlus } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/")({
	component: HomePage,
});

function HomePage() {
	const user = useUser();
	const { bands, personal } = useScopes();
	const { data: songs } = useQuery(api.songs.get.queryOptions({}));
	const recent = songs?.slice(0, 6) ?? [];

	return (
		<div className="mx-auto max-w-6xl px-6 py-10">
			<div className="flex items-center justify-between">
				<div>
					<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
						Welcome back
					</div>
					<h1 className="mt-1 font-display text-3xl font-bold">
						Evening, {user.name}.
					</h1>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" render={<Link to="/library" />}>
						<IconMusic className="size-4" /> Library
					</Button>
					<Button render={<Link to="/songs/new" />}>
						<IconPlus className="size-4" /> New song
					</Button>
				</div>
			</div>

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
								No songs yet — fork one from the curated library or write your
								own.
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
												value={chart.key}
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
						<Button
							variant="outline"
							className="mt-1 justify-start"
							onClick={async () => {
								const name = prompt("New band name");
								if (!name) return;
								await auth.organization.create({
									name,
									slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`,
								});
								location.reload();
							}}
						>
							<IconPlus className="size-4" /> Create a band
						</Button>
					</div>
				</aside>
			</div>
		</div>
	);
}
