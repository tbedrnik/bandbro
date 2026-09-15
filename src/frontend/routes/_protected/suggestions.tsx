import { api } from "@frontend/api";
import { ErrorNote } from "@frontend/components/ErrorNote";
import { ScopeSwitcher } from "@frontend/components/ScopeSwitcher";
import { Button } from "@frontend/components/ui/button";
import { useOnline } from "@frontend/lib/offline";
import { useScopes } from "@frontend/lib/scopes";
import { IconCheck, IconX } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_protected/suggestions")({
	component: SuggestionsPage,
});

/**
 * Review edits proposed by people who can read a song but not write it (PRD §8 J10).
 *
 * The create half of this shipped long ago — a Reader gets a "Suggest an edit" button and
 * the Song View promises it "proposes an edit to the band's writers". Nothing ever listed
 * one, so every suggestion went into the table and was unreachable by any human, forever.
 * This is the other half (CLAUDE.md §D27).
 */
function SuggestionsPage() {
	const { bands, personal } = useScopes();
	const online = useOnline();
	const queryClient = useQueryClient();
	const scopes = [...bands, ...(personal ? [personal] : [])];
	const [scope, setScope] = useState<string | null>(null);

	// `scopes` is rebuilt every render, so depend on the value that actually settles.
	const firstScope = scopes[0]?.param;
	useEffect(() => {
		if (!scope && firstScope) setScope(firstScope);
	}, [firstScope, scope]);

	const { data: suggestions, isPending } = useQuery({
		...api.suggestions.get.queryOptions({ organizationId: scope ?? "" }),
		enabled: !!scope && online,
		retry: online ? 3 : false,
	});

	const invalidate = () => {
		queryClient.invalidateQueries(api.suggestions.get.queryFilter());
		queryClient.invalidateQueries(
			api.suggestions["pending-count"].get.queryFilter(),
		);
		queryClient.invalidateQueries(api.songs.get.queryFilter());
	};

	if (!online) {
		return (
			<div className="mx-auto max-w-3xl px-6 py-8">
				<h1 className="font-display text-3xl font-bold">Suggestions</h1>
				<p className="mt-2 text-muted-foreground">
					You're offline — suggestions are read from the server.
				</p>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-3xl px-6 py-8">
			<h1 className="font-display text-3xl font-bold">Suggestions</h1>
			<p className="mt-2 max-w-xl text-sm text-muted-foreground">
				Edits proposed by bandmates who can read a song but not change it.
				Accepting one replaces the chart.
			</p>

			{scopes.length > 1 && (
				<div className="mt-5">
					<ScopeSwitcher
						scopes={scopes}
						value={scope ?? ""}
						onChange={setScope}
					/>
				</div>
			)}

			<div className="mt-6 flex flex-col gap-3">
				{isPending && <p className="text-muted-foreground">Loading…</p>}
				{suggestions?.length === 0 && (
					<p className="text-muted-foreground">
						Nothing waiting. Suggestions from readers in this band show up here.
					</p>
				)}
				{suggestions?.map((s) => (
					<SuggestionCard key={s.id} suggestion={s} onResolved={invalidate} />
				))}
			</div>
		</div>
	);
}

type Suggestion = NonNullable<
	ReturnType<typeof useSuggestionsQuery>["data"]
>[number];

// Derive the row type from the real response rather than re-declaring a shape that would
// drift — the same trick bands.tsx uses.
function useSuggestionsQuery(organizationId: string) {
	return useQuery({
		...api.suggestions.get.queryOptions({ organizationId }),
		enabled: false,
	});
}

function SuggestionCard({
	suggestion,
	onResolved,
}: {
	suggestion: Suggestion;
	onResolved: () => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const accept = useMutation({
		...api.suggestions({ id: suggestion.id }).accept.post.mutationOptions(),
		onSuccess: onResolved,
	});
	const reject = useMutation({
		...api.suggestions({ id: suggestion.id }).reject.post.mutationOptions(),
		onSuccess: onResolved,
	});
	const busy = accept.isPending || reject.isPending;

	return (
		<div className="rounded-xl border border-border bg-card p-4">
			<div className="flex flex-wrap items-center gap-2">
				<Link
					to="/songs/$slug"
					params={{ slug: suggestion.chart.song.slug }}
					className="font-display font-semibold hover:text-primary"
				>
					{suggestion.chart.song.name}
				</Link>
				<span className="text-xs text-muted-foreground">
					from {suggestion.proposer.name}
				</span>
			</div>

			{suggestion.message && (
				<p className="mt-2 text-sm">“{suggestion.message}”</p>
			)}

			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="mt-3 font-mono text-xs text-muted-foreground hover:text-foreground"
			>
				{expanded ? "Hide proposed chart" : "Show proposed chart"}
			</button>
			{expanded && (
				<pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-secondary p-3 font-mono text-xs whitespace-pre-wrap">
					{suggestion.proposedContent}
				</pre>
			)}

			<div className="mt-4 flex gap-2">
				<Button disabled={busy} onClick={() => accept.mutate({})}>
					<IconCheck className="size-4" /> Accept
				</Button>
				<Button
					variant="outline"
					disabled={busy}
					onClick={() => reject.mutate({})}
				>
					<IconX className="size-4" /> Reject
				</Button>
			</div>
			<ErrorNote
				error={accept.error ?? reject.error}
				when={accept.isError || reject.isError}
				subject="That suggestion"
			/>
		</div>
	);
}
