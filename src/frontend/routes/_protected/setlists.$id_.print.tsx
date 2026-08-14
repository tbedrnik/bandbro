import { api } from "@frontend/api";
import { ChordSheet } from "@frontend/components/ChordSheet";
import { displayKey } from "@shared/notation";
import { buildSongView } from "@shared/songView";
import type { ChordView } from "@shared/transpose";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_protected/setlists/$id_/print")({
	component: PrintView,
});

type Mode = "fingered" | "concert" | "both";

/**
 * Printable, in-order chord-sheet view (E1/E2). Uses the browser's print-to-PDF
 * (CLAUDE.md §D8). One song per page; "both" prints a capo'd song twice (as-fingered
 * then concert). Reuses ChordSheet + the shared transpose engine, so print matches
 * exactly what players see on screen.
 */
function PrintView() {
	const { id } = Route.useParams();
	const [mode, setMode] = useState<Mode>("both");
	const { data: setlist } = useQuery(
		api.songbooks({ id }).get.queryOptions({}),
	);

	if (!setlist) return <div className="p-10">Loading…</div>;

	const pages: {
		title: string;
		view: ChordView;
		content: string;
		capo: number;
	}[] = [];
	for (const entry of setlist.songs) {
		const {
			song,
			content,
			capo: rawCapo,
		} = {
			song: entry.chart.song,
			content: entry.chart.content,
			capo: entry.chart.capo ?? 0,
		};
		const views: ChordView[] =
			mode === "both"
				? rawCapo > 0
					? ["fingered", "concert"]
					: ["fingered"]
				: [mode];
		for (const view of views) {
			pages.push({ title: song.name, view, content, capo: rawCapo });
		}
	}

	return (
		<div className="bg-white text-black">
			{/* Print toolbar — hidden when printing */}
			<div className="print:hidden sticky top-0 flex items-center gap-3 border-b bg-white px-6 py-3">
				<span className="font-display font-semibold">
					{setlist.title} · {pages.length} pages
				</span>
				<label className="ml-auto flex items-center gap-2 text-sm">
					Render mode
					<select
						value={mode}
						onChange={(e) => setMode(e.target.value as Mode)}
						className="rounded border px-2 py-1"
					>
						<option value="fingered">As-fingered</option>
						<option value="concert">Concert pitch</option>
						<option value="both">Both (capo songs twice)</option>
					</select>
				</label>
				<button
					type="button"
					onClick={() => window.print()}
					className="rounded-lg bg-black px-4 py-2 font-display text-sm font-semibold text-white"
				>
					Print / Save PDF
				</button>
			</div>

			{pages.map((page, i) => {
				const { blocks, displayedKey, meta } = buildSongView({
					content: page.content,
					capo: page.capo,
					view: page.view,
				});
				return (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: positional pages
						key={i}
						className="mx-auto min-h-[100vh] max-w-[800px] break-after-page px-12 py-10"
					>
						<div className="mb-6 border-b border-gray-300 pb-3">
							<h1 className="font-display text-2xl font-bold">{page.title}</h1>
							<div className="mt-1 font-mono text-sm text-gray-600">
								{meta.artist && `${meta.artist} · `}
								{displayedKey && `Key ${displayKey(displayedKey)} · `}
								{page.capo > 0 && `Capo ${page.capo} · `}
								{page.view === "concert" ? "concert pitch" : "as-fingered"}
							</div>
						</div>
						<ChordSheet blocks={blocks} />
					</div>
				);
			})}
		</div>
	);
}
