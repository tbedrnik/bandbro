import { ChordProEditorScreen } from "@frontend/components/ChordProEditorScreen";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/songs/new")({
	component: () => <ChordProEditorScreen mode="new" />,
});
