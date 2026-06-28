import { api } from "@frontend/api";
import { NamePromptDialog } from "@frontend/components/NamePromptDialog";
import { Button } from "@frontend/components/ui/button";
import { useScopes } from "@frontend/lib/scopes";
import { IconPlaylist, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Outlet,
	useMatchRoute,
} from "@tanstack/react-router";
import { useState } from "react";

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

function SetlistsIndex() {
	const { bands, personal } = useScopes();
	const queryClient = useQueryClient();
	const { data: setlists, isPending } = useQuery(
		api.songbooks.get.queryOptions({}),
	);
	const writableScopes = [...bands, ...(personal ? [personal] : [])];

	const [dialogOpen, setDialogOpen] = useState(false);

	const create = useMutation({
		...api.songbooks.post.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries(api.songbooks.get.queryFilter());
			setDialogOpen(false);
		},
	});

	const onCreate = (title: string) => {
		const target = writableScopes[0]?.id;
		if (!target) return;
		create.mutate({ title, organizationId: target });
	};

	return (
		<div className="mx-auto max-w-4xl px-6 py-8">
			<div className="flex items-center justify-between">
				<h1 className="font-display text-3xl font-bold">Setlists</h1>
				<Button onClick={() => setDialogOpen(true)} disabled={create.isPending}>
					<IconPlus className="size-4" /> New setlist
				</Button>
			</div>

			<div className="mt-6 grid gap-3 sm:grid-cols-2">
				{isPending ? (
					<p className="text-muted-foreground">Loading…</p>
				) : !setlists?.length ? (
					<p className="text-muted-foreground">
						No setlists yet — create one for your next rehearsal or gig.
					</p>
				) : (
					setlists.map((s) => (
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
								{s._count?.songs ?? 0} songs · {s.organization?.name}
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
			/>
		</div>
	);
}
