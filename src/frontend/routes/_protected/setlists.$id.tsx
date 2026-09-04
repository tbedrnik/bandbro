import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	restrictToParentElement,
	restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "@frontend/api";
import { MetaChip } from "@frontend/components/MetaChip";
import { OfflinePill } from "@frontend/components/OfflinePill";
import { ShareWithFansModal } from "@frontend/components/ShareWithFansModal";
import { Button } from "@frontend/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@frontend/components/ui/dropdown-menu";
import { Input } from "@frontend/components/ui/input";
import { downloadSetlist, isDownloaded } from "@frontend/lib/offline";
import { useFanSession } from "@frontend/lib/useFanSession";
import { cn } from "@frontend/lib/utils";
import { displayKey } from "@shared/notation";
import {
	IconDownload,
	IconFileTypePdf,
	IconGripVertical,
	IconPlayerPlay,
	IconPlus,
	IconShare3,
	IconX,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_protected/setlists/$id")({
	component: SetlistDetail,
});

// Wrapping the Eden query in a hook lets the row component derive its prop type from
// the real response instead of re-declaring a shape that would silently drift.
function useSetlistQuery(id: string) {
	return useQuery(api.songbooks({ id }).get.queryOptions({}));
}

type Setlist = NonNullable<ReturnType<typeof useSetlistQuery>["data"]>;
type SetlistEntry = Setlist["songs"][number];

function SetlistDetail() {
	const { id } = Route.useParams();
	const queryClient = useQueryClient();
	const [adding, setAdding] = useState(false);
	const [q, setQ] = useState("");
	const [downloaded, setDownloaded] = useState(() => isDownloaded(id));
	const [shareOpen, setShareOpen] = useState(false);
	// Order shown while a reorder is in flight, so a dragged row doesn't snap back to
	// its old position for the length of the PUT + refetch. Cleared as soon as the
	// server's own order changes (it caught up, or a song was added/removed).
	const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
	const fan = useFanSession(id);

	const { data: setlist, isPending } = useSetlistQuery(id);

	const update = useMutation({
		...api.songbooks({ id }).put.mutationOptions(),
		onSuccess: () =>
			queryClient.invalidateQueries(api.songbooks.get.queryFilter()),
		onError: () => setPendingOrder(null),
	});

	// Pointer drags start after a few px so a tap on the handle still behaves like a
	// tap; the keyboard sensor makes the same reorder reachable without a mouse.
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const serverOrder = (setlist?.songs ?? []).map((s) => s.chartId).join(",");
	// biome-ignore lint/correctness/useExhaustiveDependencies: the server order string is the trigger
	useEffect(() => {
		setPendingOrder(null);
	}, [serverOrder]);

	const { data: searchResults } = useQuery({
		...api.songs.get.queryOptions(q ? { q } : {}),
		enabled: adding,
	});

	if (isPending || !setlist) {
		return (
			<div className="grid min-h-[60vh] place-items-center text-muted-foreground">
				Loading…
			</div>
		);
	}

	const chartIds = pendingOrder ?? setlist.songs.map((s) => s.chartId);
	const byChartId = new Map(setlist.songs.map((s) => [s.chartId, s]));
	const ordered = chartIds.flatMap((chartId) => {
		const entry = byChartId.get(chartId);
		return entry ? [entry] : [];
	});

	const onDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id) return;
		const from = chartIds.indexOf(String(active.id));
		const to = chartIds.indexOf(String(over.id));
		if (from < 0 || to < 0) return;
		const next = arrayMove(chartIds, from, to);
		setPendingOrder(next);
		update.mutate({ chartIds: next });
	};
	const remove = (chartId: string) => {
		const next = chartIds.filter((c) => c !== chartId);
		setPendingOrder(next);
		update.mutate({ chartIds: next });
	};
	const add = (chartId: string) => {
		if (chartIds.includes(chartId)) return;
		update.mutate({ chartIds: [...chartIds, chartId] });
	};

	const onDownload = () => {
		downloadSetlist(id, setlist);
		setDownloaded(true);
	};

	return (
		<div className="mx-auto max-w-4xl px-6 py-8">
			<Link
				to="/setlists"
				className="font-mono text-xs text-muted-foreground hover:text-foreground"
			>
				← Setlists
			</Link>
			<div className="mt-2 flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="font-display text-3xl font-bold">{setlist.title}</h1>
					<div className="mt-1 font-mono text-xs text-muted-foreground">
						{setlist.songs.length} songs · {setlist.organization?.name}
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{downloaded ? (
						<OfflinePill label="Offline" detail="setlist downloaded" />
					) : (
						<Button variant="outline" onClick={onDownload}>
							<IconDownload className="size-4" /> Download for offline
						</Button>
					)}
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button variant="outline" disabled={!setlist.songs.length}>
									<IconFileTypePdf className="size-4" /> Export PDF
								</Button>
							}
						/>
						<DropdownMenuContent>
							{(
								[
									["both", "As-fingered + concert"],
									["fingered", "As-fingered only"],
									["concert", "Concert pitch only"],
								] as const
							).map(([mode, label]) => (
								<DropdownMenuItem
									key={mode}
									render={
										// Server-rendered PDF (chordpro CLI). Same-origin link sends the
										// session cookie; `download` saves it straight to disk.
										<a
											href={`/api/songbooks/${id}/pdf?mode=${mode}`}
											download
										/>
									}
								>
									{label}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
					<Button
						variant="outline"
						disabled={!setlist.songs.length}
						onClick={() => {
							fan.ensure();
							setShareOpen(true);
						}}
					>
						<IconShare3 className="size-4" /> Share with fans
					</Button>
					<Button
						render={<Link to="/live/$id" params={{ id }} />}
						disabled={!setlist.songs.length}
					>
						<IconPlayerPlay className="size-4" /> Live mode
					</Button>
				</div>
			</div>

			<ShareWithFansModal
				open={shareOpen}
				onClose={() => setShareOpen(false)}
				title={`Share “${setlist.title}”`}
				code={fan.code}
				heading="Fans follow this set, live"
				blurb="Print the QR for the door or merch table, or share the link. Fans scan to open a read-only Live Mode that follows the set automatically — or enter the code at bandbro.live. Lyrics by default, chords on tap."
				watching={fan.watching}
				showPrint
			/>

			{/* Songs — drag the handle on the left to reorder the set. */}
			{ordered.length === 0 ? (
				<div className="mt-6 rounded-xl border border-border px-4 py-10 text-center text-muted-foreground">
					No songs yet — add some below.
				</div>
			) : (
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					modifiers={[restrictToVerticalAxis, restrictToParentElement]}
					onDragEnd={onDragEnd}
				>
					<SortableContext
						items={chartIds}
						strategy={verticalListSortingStrategy}
					>
						<div className="mt-6 rounded-xl border border-border">
							{ordered.map((entry, i) => (
								<SongRow
									key={entry.chartId}
									entry={entry}
									position={i + 1}
									onRemove={() => remove(entry.chartId)}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
			)}

			{/* Add songs */}
			<div className="mt-4">
				{!adding ? (
					<Button
						variant="dashed"
						className="w-full"
						onClick={() => setAdding(true)}
					>
						<IconPlus className="size-4" /> Add songs
					</Button>
				) : (
					<div className="rounded-xl border border-border bg-card p-4">
						<div className="flex items-center gap-2">
							<Input
								value={q}
								onChange={(e) => setQ(e.target.value)}
								placeholder="Search songs across your libraries"
								autoFocus
							/>
							<Button variant="ghost" onClick={() => setAdding(false)}>
								Done
							</Button>
						</div>
						<div className="mt-3 max-h-72 overflow-auto">
							{searchResults?.map((song) => {
								const chartId = song.charts[0]?.id;
								const inList = chartId && chartIds.includes(chartId);
								return (
									<button
										key={song.id}
										type="button"
										disabled={!chartId || !!inList}
										onClick={() => chartId && add(chartId)}
										className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-muted disabled:opacity-40"
									>
										<span className="font-display text-sm">
											{song.name}
											<span className="ml-2 text-xs text-muted-foreground">
												{song.organization?.name ?? "Curated"}
											</span>
										</span>
										<span className="text-xs text-muted-foreground">
											{inList ? "added" : "+ add"}
										</span>
									</button>
								);
							})}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

/**
 * One song in the set. `useSortable` supplies the drag transform; the listeners are
 * bound to the grip alone (not the whole row) so the title stays a link and a touch
 * anywhere else still scrolls the page — `touch-none` on the grip is what lets a
 * finger drag it at all.
 */
function SongRow({
	entry,
	position,
	onRemove,
}: {
	entry: SetlistEntry;
	position: number;
	onRemove: () => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: entry.chartId });
	const song = entry.chart.song;
	const artist = song.credits.map((c) => c.artist.name).join(", ");

	return (
		<div
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={cn(
				"flex items-center gap-3 border-b border-border bg-background px-4 py-3 first:rounded-t-xl last:rounded-b-xl last:border-0",
				isDragging && "relative z-10 rounded-xl shadow-lg",
			)}
		>
			<button
				type="button"
				aria-label={`Reorder ${song.name}`}
				className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
				{...attributes}
				{...listeners}
			>
				<IconGripVertical className="size-4" />
			</button>
			<span className="w-6 text-center font-mono text-sm text-muted-foreground">
				{position}
			</span>
			<div className="flex-1">
				<Link
					to="/songs/$slug"
					params={{ slug: song.slug }}
					className="font-display font-medium hover:text-primary"
				>
					{song.name}
				</Link>
				<div className="text-xs text-muted-foreground">{artist}</div>
			</div>
			{entry.chart.key && (
				<MetaChip
					label=""
					value={displayKey(entry.chart.key)}
					className="px-2 py-1"
				/>
			)}
			<button
				type="button"
				aria-label={`Remove ${song.name}`}
				onClick={onRemove}
				className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			>
				<IconX className="size-4" />
			</button>
		</div>
	);
}
