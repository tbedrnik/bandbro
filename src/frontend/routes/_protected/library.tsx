import { api } from "@frontend/api";
import { ImportSongButton } from "@frontend/components/ImportSongDialog";
import { MetaChip, Tag } from "@frontend/components/MetaChip";
import { ScopeSwitcher } from "@frontend/components/ScopeSwitcher";
import { Button } from "@frontend/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@frontend/components/ui/dropdown-menu";
import { Input } from "@frontend/components/ui/input";
import { useOnline } from "@frontend/lib/offline";
import {
	type Scope,
	useRememberedScope,
	useScopes,
} from "@frontend/lib/scopes";
import { displayKey } from "@shared/notation";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_protected/library")({
	component: LibraryPage,
});

const DESCRIPTIONS: Record<string, string> = {
	curated:
		"A read-only, community-maintained collection. Fork anything into a band or your personal library.",
	personal: "Your private one-man-band library.",
	band: "Your band's shared library.",
};

function LibraryPage() {
	const { scopes, bands, personal, isPending: scopesPending } = useScopes();
	const [scopeParam, setScopeParam] = useRememberedScope(scopes, scopesPending);
	const [q, setQ] = useState("");
	const online = useOnline();

	const active: Scope = scopes.find((s) => s.param === scopeParam) ?? scopes[0];

	const { data: songs, isPending } = useQuery({
		...api.songs.get.queryOptions({ scope: scopeParam, ...(q ? { q } : {}) }),
		// Offline the fetch can only fail; retrying it three times just holds the screen
		// on "Loading…" before it can say so.
		retry: online ? 3 : false,
	});

	const writableScopes = [...bands, ...(personal ? [personal] : [])];

	return (
		<div className="mx-auto max-w-6xl px-6 py-8">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<ScopeSwitcher
					scopes={scopes}
					value={scopeParam}
					onChange={setScopeParam}
				/>
				{/* Both write to the server; ImportSongButton hides itself offline (§D7). */}
				<div className="flex gap-2">
					<ImportSongButton />
					{online && (
						<Button render={<Link to="/songs/new" />}>
							<IconPlus className="size-4" /> New song
						</Button>
					)}
				</div>
			</div>

			<div className="mt-6 flex flex-wrap items-end justify-between gap-2">
				<div>
					<h1 className="font-display text-3xl font-bold">{active?.name}</h1>
					<p className="mt-1 max-w-2xl text-sm text-muted-foreground">
						{DESCRIPTIONS[active?.kind ?? "band"]}
					</p>
				</div>
				<div className="font-mono text-sm text-muted-foreground">
					{songs?.length ?? 0} songs
				</div>
			</div>

			{/* Search runs against the server, not a local index — the offline shelf is
			    where a player searches with no signal (§D15). */}
			{online && (
				<div className="relative mt-5">
					<IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder="Search title or artist"
						className="pl-9"
					/>
				</div>
			)}

			<div className="mt-4 overflow-hidden rounded-xl border border-border">
				<div className="hidden grid-cols-[1fr_180px_70px_70px_160px] items-center gap-4 border-b border-border bg-card px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:grid">
					<div>Song</div>
					<div>Artist</div>
					<div>Key</div>
					<div>Capo</div>
					<div className="text-right">Actions</div>
				</div>
				{isPending ? (
					<div className="px-4 py-10 text-center text-muted-foreground">
						Loading…
					</div>
				) : !songs?.length ? (
					<div className="px-4 py-10 text-center text-muted-foreground">
						{online ? (
							"No songs here yet."
						) : (
							<>
								You're offline — the library needs a connection.{" "}
								<Link to="/offline" className="text-primary hover:underline">
									Your downloaded setlists
								</Link>{" "}
								are on this device.
							</>
						)}
					</div>
				) : (
					songs.map((song) => {
						const chart = song.charts[0];
						const artist = song.credits.map((c) => c.artist.name).join(", ");
						return (
							// A 652px-wide five-column grid has nowhere to go on a 390px
							// phone — the key, capo and both actions were simply clipped off
							// the right edge — so below `sm` the row stacks into a card and
							// the columns collapse into one meta line.
							<div
								key={song.id}
								className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-0 hover:bg-card/60 sm:grid sm:grid-cols-[1fr_180px_70px_70px_160px] sm:items-center sm:gap-4"
							>
								<div>
									<Link
										to="/songs/$slug"
										params={{ slug: song.slug }}
										className="font-display font-semibold hover:text-primary"
									>
										{song.name}
									</Link>
									<div className="mt-1 flex gap-1.5">
										{song.tags.map((t) => (
											<Tag key={t.tag.id} className="px-2 py-0.5 text-[11px]">
												{t.tag.name}
											</Tag>
										))}
									</div>
								</div>
								<div className="hidden text-sm text-muted-foreground sm:block">
									{artist || "—"}
								</div>
								<div className="hidden sm:block">
									{chart?.key ? (
										<MetaChip
											label=""
											value={displayKey(chart.key)}
											className="px-2 py-1"
										/>
									) : (
										"—"
									)}
								</div>
								<div className="hidden font-mono text-sm text-muted-foreground sm:block">
									{chart?.capo ? chart.capo : "—"}
								</div>
								{/* Phone-only: the three collapsed columns, labelled so a bare
								    "2" can't be mistaken for anything but a capo. */}
								<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground sm:hidden">
									<span>{artist || "—"}</span>
									{chart?.key && (
										<MetaChip
											label="Key"
											value={displayKey(chart.key)}
											className="px-2 py-1"
										/>
									)}
									{chart?.capo ? (
										<MetaChip
											label="Capo"
											value={chart.capo}
											className="px-2 py-1"
										/>
									) : null}
								</div>
								<div className="flex gap-2 sm:justify-end">
									<Button
										size="sm"
										variant="outline"
										render={
											<Link to="/songs/$slug" params={{ slug: song.slug }} />
										}
									>
										Open
									</Button>
									{/* Forking copies the song server-side. */}
									{online && (
										<ForkButton
											slug={song.slug}
											writableScopes={writableScopes}
										/>
									)}
								</div>
							</div>
						);
					})
				)}
			</div>
		</div>
	);
}

function ForkButton({
	slug,
	writableScopes,
}: {
	slug: string;
	writableScopes: Scope[];
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const fork = useMutation({
		...api.songs({ slug }).fork.post.mutationOptions(),
		onSuccess: (created) => {
			queryClient.invalidateQueries(api.songs.get.queryFilter());
			navigate({ to: "/songs/$slug", params: { slug: created.slug } });
		},
	});
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button size="sm" variant="solid" disabled={fork.isPending}>
						Fork
					</Button>
				}
			/>
			<DropdownMenuContent>
				{writableScopes.map((s) => (
					<DropdownMenuItem
						key={s.param}
						onClick={() => s.id && fork.mutate({ targetOrganizationId: s.id })}
					>
						{s.name}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
