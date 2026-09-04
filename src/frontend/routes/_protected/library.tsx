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

	const active: Scope = scopes.find((s) => s.param === scopeParam) ?? scopes[0];

	const { data: songs, isPending } = useQuery(
		api.songs.get.queryOptions({ scope: scopeParam, ...(q ? { q } : {}) }),
	);

	const writableScopes = [...bands, ...(personal ? [personal] : [])];

	return (
		<div className="mx-auto max-w-6xl px-6 py-8">
			<div className="flex items-center justify-between">
				<ScopeSwitcher
					scopes={scopes}
					value={scopeParam}
					onChange={setScopeParam}
				/>
				<div className="flex gap-2">
					<ImportSongButton />
					<Button render={<Link to="/songs/new" />}>
						<IconPlus className="size-4" /> New song
					</Button>
				</div>
			</div>

			<div className="mt-6 flex items-end justify-between">
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

			<div className="relative mt-5">
				<IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder="Search title or artist"
					className="pl-9"
				/>
			</div>

			<div className="mt-4 overflow-hidden rounded-xl border border-border">
				<div className="grid grid-cols-[1fr_180px_70px_70px_160px] items-center gap-4 border-b border-border bg-card px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
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
						No songs here yet.
					</div>
				) : (
					songs.map((song) => {
						const chart = song.charts[0];
						const artist = song.credits.map((c) => c.artist.name).join(", ");
						return (
							<div
								key={song.id}
								className="grid grid-cols-[1fr_180px_70px_70px_160px] items-center gap-4 border-b border-border px-4 py-3 last:border-0 hover:bg-card/60"
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
								<div className="text-sm text-muted-foreground">
									{artist || "—"}
								</div>
								<div>
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
								<div className="font-mono text-sm text-muted-foreground">
									{chart?.capo ? chart.capo : "—"}
								</div>
								<div className="flex justify-end gap-2">
									<Button
										size="sm"
										variant="outline"
										render={
											<Link to="/songs/$slug" params={{ slug: song.slug }} />
										}
									>
										Open
									</Button>
									<ForkButton
										slug={song.slug}
										writableScopes={writableScopes}
									/>
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
