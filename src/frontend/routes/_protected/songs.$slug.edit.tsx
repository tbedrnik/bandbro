import { api } from "@frontend/api";
import { ChordProEditorScreen } from "@frontend/components/ChordProEditorScreen";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/songs/$slug/edit")({
	validateSearch: (search: Record<string, unknown>): { suggest?: boolean } => ({
		suggest: search.suggest === true || search.suggest === "true",
	}),
	component: EditPage,
});

function EditPage() {
	const { slug } = Route.useParams();
	const { suggest } = Route.useSearch();
	const { data: song, isPending } = useQuery(
		api.songs({ slug }).get.queryOptions({}),
	);

	if (isPending || !song) {
		return (
			<div className="grid min-h-[60vh] place-items-center text-muted-foreground">
				Loading…
			</div>
		);
	}

	const chart = song.charts[0];
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
