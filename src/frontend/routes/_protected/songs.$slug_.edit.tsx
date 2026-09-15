import { api } from "@frontend/api";
import { ChordProEditorScreen } from "@frontend/components/ChordProEditorScreen";
import { useOnline } from "@frontend/lib/offline";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/songs/$slug_/edit")({
	validateSearch: (search: Record<string, unknown>): { suggest?: boolean } => ({
		suggest: search.suggest === true || search.suggest === "true",
	}),
	component: EditPage,
});

function EditPage() {
	const { slug } = Route.useParams();
	const { suggest } = Route.useSearch();
	const online = useOnline();
	const { data: song, isPending } = useQuery({
		...api.songs({ slug }).get.queryOptions({}),
		// Nothing to edit from this device — fail fast rather than sit on "Loading…".
		retry: online ? 3 : false,
	});

	if (isPending) {
		return (
			<div className="grid min-h-[60vh] place-items-center text-muted-foreground">
				Loading…
			</div>
		);
	}
	if (!song) {
		return (
			<div className="grid min-h-[60vh] place-items-center px-6 text-center text-muted-foreground">
				{online
					? "Song not found."
					: "You're offline — editing needs a connection."}
			</div>
		);
	}

	const chart = song.charts[0];
	// Readable-but-chartless is possible (a chart in a scope this account can't read),
	// and reaching into `charts[0]` for its id threw the whole app to the error boundary.
	if (!chart) {
		return (
			<div className="grid min-h-[60vh] place-items-center px-6 text-center text-muted-foreground">
				This song has no arrangement you can edit.
			</div>
		);
	}
	return (
		<ChordProEditorScreen
			mode={suggest ? "suggest" : "edit"}
			slug={slug}
			chartId={chart.id}
			initialContent={chart.content}
			initialName={song.name}
		/>
	);
}
