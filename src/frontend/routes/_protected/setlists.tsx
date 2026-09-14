import { api } from "@frontend/api";
import { LineupPicker } from "@frontend/components/LineupPicker";
import { NamePromptDialog } from "@frontend/components/NamePromptDialog";
import { Button } from "@frontend/components/ui/button";
import { lineupLabel, useLineups } from "@frontend/lib/lineups";
import { useOnline } from "@frontend/lib/offline";
import { useScopes } from "@frontend/lib/scopes";
import { cn } from "@frontend/lib/utils";
import { IconPlaylist, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Outlet,
	useMatchRoute,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_protected/setlists")({
	component: SetlistsLayout,
});

function SetlistsLayout() {
	const matchRoute = useMatchRoute();
	// When a specific setlist (or its print view) is open, render only that.
	const onChild = matchRoute({ to: "/setlists/$id", fuzzy: true });
	if (onChild) return <Outlet />;
	return <SetlistsIndex />;
}

const ALL = "all";

function SetlistsIndex() {
	const { bands, personal } = useScopes();
	const queryClient = useQueryClient();
	const online = useOnline();
	const { data: setlists, isPending } = useQuery({
		...api.songbooks.get.queryOptions({}),
		// With no signal this can only fail; retrying just holds "Loading…" on screen.
		retry: online ? 3 : false,
	});
	const { data: lineups } = useLineups();

	const writableScopes = [...bands, ...(personal ? [personal] : [])];
	const bandName = (organizationId: string) =>
		writableScopes.find((s) => s.id === organizationId)?.name ?? "Band";

	// Every lineup the player could file a setlist under. More than one is what makes
	// the whole concept visible (§D25) — below that this screen looks exactly as it did.
	const options = (lineups ?? []).filter((l) =>
		writableScopes.some((s) => s.id === l.organizationId),
	);
	const showLineups = options.length > 1;

	const [filter, setFilter] = useState(ALL);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [target, setTarget] = useState<string | null>(null);

	// Default the new-setlist target to the first lineup once they load, and drop a
	// filter whose lineup has gone (deleted, or a band the player has left).
	useEffect(() => {
		if (!target && options[0]) setTarget(options[0].id);
		if (filter !== ALL && !options.some((l) => l.id === filter)) setFilter(ALL);
	}, [options, target, filter]);

	const create = useMutation({
		...api.songbooks.post.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries(api.songbooks.get.queryFilter());
			setDialogOpen(false);
		},
	});

	const onCreate = (title: string) => {
		if (!target) return;
		create.mutate({ title, lineupId: target });
	};

	const visible = (setlists ?? []).filter(
		(s) => filter === ALL || s.lineupId === filter,
	);

	return (
		<div className="mx-auto max-w-4xl px-6 py-8">
			<div className="flex items-center justify-between">
				<h1 className="font-display text-3xl font-bold">Setlists</h1>
				{/* Creating a setlist is a POST — nothing to offer with no signal (§D7). */}
				{online && (
					<Button
						onClick={() => setDialogOpen(true)}
						disabled={create.isPending || !target}
					>
						<IconPlus className="size-4" /> New setlist
					</Button>
				)}
			</div>

			{showLineups && online && (
				<div className="mt-5 flex flex-wrap gap-2">
					{[
						{ id: ALL, label: "All" },
						...options.map((l) => ({
							id: l.id,
							label: lineupLabel(l, bandName(l.organizationId)),
						})),
					].map((opt) => (
						<button
							key={opt.id}
							type="button"
							onClick={() => setFilter(opt.id)}
							className={cn(
								"inline-flex items-center rounded-xl px-4 py-2 font-display text-sm font-semibold transition-colors",
								opt.id === filter
									? "bg-foreground text-background"
									: "bg-card text-foreground hover:bg-muted",
							)}
						>
							{opt.label}
						</button>
					))}
				</div>
			)}

			<div className="mt-6 grid gap-3 sm:grid-cols-2">
				{isPending ? (
					<p className="text-muted-foreground">Loading…</p>
				) : !visible.length ? (
					<p className="text-muted-foreground">
						{!online ? (
							<>
								You're offline — setlists are read from the server.{" "}
								<Link to="/offline" className="text-primary hover:underline">
									Your downloaded sets
								</Link>{" "}
								are on this device.
							</>
						) : filter !== ALL ? (
							"Nothing under this lineup yet."
						) : (
							"No setlists yet — create one for your next rehearsal or gig."
						)}
					</p>
				) : (
					visible.map((s) => (
						<Link
							key={s.id}
							to="/setlists/$id"
							params={{ id: s.id }}
							className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
						>
							<IconPlaylist className="size-5 text-primary" />
							<div className="mt-3 font-display text-lg font-semibold">
								{s.title}
							</div>
							<div className="mt-1 font-mono text-xs text-muted-foreground">
								{s._count?.songs ?? 0} songs ·{" "}
								{lineupLabel(s.lineup, s.organization?.name)}
							</div>
						</Link>
					))
				)}
			</div>

			<NamePromptDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				title="New setlist"
				description="Name it for the gig or rehearsal — you can add songs next."
				label="Setlist name"
				placeholder="Friday gig @ The Anchor"
				submitLabel="Create setlist"
				pending={create.isPending}
				onSubmit={onCreate}
			>
				<LineupPicker
					lineups={options}
					bandName={bandName}
					value={target}
					onChange={setTarget}
				/>
			</NamePromptDialog>
		</div>
	);
}
