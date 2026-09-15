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
import { ExportPdfButton } from "@frontend/components/ExportPdfButton";
import { LineupPicker } from "@frontend/components/LineupPicker";
import { MetaChip } from "@frontend/components/MetaChip";
import { NamePromptDialog } from "@frontend/components/NamePromptDialog";
import { OfflinePill } from "@frontend/components/OfflinePill";
import { ReadinessChip } from "@frontend/components/ReadinessChip";
import { ShareWithFansModal } from "@frontend/components/ShareWithFansModal";
import { Button } from "@frontend/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@frontend/components/ui/dropdown-menu";
import { Input } from "@frontend/components/ui/input";
import { lineupLabel, useLineups } from "@frontend/lib/lineups";
import {
	downloadSetlist,
	getOfflineSetlist,
	isDownloaded,
	removeOfflineSetlist,
	useOfflineSync,
	useOnline,
} from "@frontend/lib/offline";
import { useScopes } from "@frontend/lib/scopes";
import { useFanSession } from "@frontend/lib/useFanSession";
import { cn } from "@frontend/lib/utils";
import { displayKey } from "@shared/notation";
import { readinessRank } from "@shared/proficiency";
import {
	IconCopy,
	IconDotsVertical,
	IconDownload,
	IconGripVertical,
	IconPencil,
	IconPlayerPlay,
	IconPlus,
	IconShare3,
	IconX,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_protected/setlists/$id")({
	// `?export=<jobId>` is how a "your PDF is ready" notification points back here
	// (§D21) — it carries the job so the Download button is waiting even on a device
	// that didn't start the export.
	// Optional by construction — an absent key rather than an explicit `undefined`,
	// which would make `search` a required prop on every Link pointing here.
	validateSearch: (search: Record<string, unknown>): { export?: string } =>
		typeof search.export === "string" ? { export: search.export } : {},
	component: SetlistDetail,
});

// Wrapping the Eden query in a hook lets the row component derive its prop type from
// the real response instead of re-declaring a shape that would silently drift.
function useSetlistQuery(id: string) {
	return useQuery({
		...api.songbooks({ id }).get.queryOptions({}),
		// Same seed Live mode uses (§D7): a downloaded set opens from the device, so
		// arriving here with no signal shows the songs instead of a stuck "Loading…".
		// `retry: false` lets a set that *isn't* on this device fail fast and say so.
		initialData: () => getOfflineSetlist(id) ?? undefined,
		retry: false,
	});
}

type Setlist = NonNullable<ReturnType<typeof useSetlistQuery>["data"]>;
type SetlistEntry = Setlist["songs"][number];

function SetlistDetail() {
	const { id } = Route.useParams();
	const { export: exportJobId } = Route.useSearch();
	const queryClient = useQueryClient();
	const navigate = Route.useNavigate();
	const online = useOnline();
	const [adding, setAdding] = useState(false);
	const [q, setQ] = useState("");
	const [downloaded, setDownloaded] = useState(() => isDownloaded(id));
	const [shareOpen, setShareOpen] = useState(false);
	const [renameOpen, setRenameOpen] = useState(false);
	const [cloneOpen, setCloneOpen] = useState(false);
	const [cloneTarget, setCloneTarget] = useState<string | null>(null);
	// Order shown while a reorder is in flight, so a dragged row doesn't snap back to
	// its old position for the length of the PUT + refetch. Cleared as soon as the
	// server's own order changes (it caught up, or a song was added/removed).
	const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
	const fan = useFanSession(id);

	const { data: setlist, isPending } = useSetlistQuery(id);
	const setlistOrgId = setlist?.organizationId;
	const setlistLineupId = setlist?.lineupId;

	const update = useMutation({
		...api.songbooks({ id }).put.mutationOptions(),
		onSuccess: () =>
			queryClient.invalidateQueries(api.songbooks.get.queryFilter()),
		onError: () => setPendingOrder(null),
	});
	// The API sets a status with no body on purpose (a body would widen every route's Eden
	// success type — see api.ts), so the reason is written here from the status. Without
	// this a refused change is completely silent: the dragged row just slides back.
	const updateStatus = (update.error as { status?: number } | null)?.status;

	const { data: lineups } = useLineups();
	const { bands, personal } = useScopes();
	const clone = useMutation({
		...api.songbooks({ id }).clone.post.mutationOptions(),
		onSuccess: (created) => {
			queryClient.invalidateQueries(api.songbooks.get.queryFilter());
			setCloneOpen(false);
			if (created?.id)
				navigate({ to: "/setlists/$id", params: { id: created.id } });
		},
	});

	// Pointer drags start after a few px so a tap on the handle still behaves like a
	// tap; the keyboard sensor makes the same reorder reachable without a mouse.
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	// A set downloaded last week and edited at rehearsal since is the offline feature's
	// real failure mode — you find out at the venue, with no signal. While the fresh
	// payload is on screen there is nothing to ask about, so the copy is refreshed from
	// it silently; only a refresh that *fails* needs the player (§D7).
	const syncStatus = useOfflineSync(id, online ? setlist : undefined);

	const ownLineupId = setlist?.lineupId;
	useEffect(() => {
		if (!cloneTarget && ownLineupId) setCloneTarget(ownLineupId);
	}, [cloneTarget, ownLineupId]);

	const serverOrder = (setlist?.songs ?? []).map((s) => s.chartId).join(",");
	// biome-ignore lint/correctness/useExhaustiveDependencies: the server order string is the trigger
	useEffect(() => {
		setPendingOrder(null);
	}, [serverOrder]);

	// Asking for the readiness of *this set's lineup* is what turns the search into a
	// builder: the same library sorts differently for the duo and for the full band,
	// which is the whole point of marking who can play what (§D26).
	const { data: searchResults } = useQuery({
		...api.songs.get.queryOptions({
			...(q ? { q } : {}),
			...(setlistLineupId ? { lineupId: setlistLineupId } : {}),
		}),
		enabled: adding && online,
	});

	// Only this band's own songs and Curated ones can go into the set. A chart owned by
	// another band would be a *reference*, leaving two bands silently editing one chart,
	// so the server rejects it (§D25) — offering it here would only produce failures.
	// Filtered client-side rather than with the `scope` param, which is an exact match on
	// one organization and would drop the Curated library with it.
	const addable = (searchResults ?? [])
		.filter(
			(song) =>
				song.organizationId === null || song.organizationId === setlistOrgId,
		)
		// Songs this lineup can actually play come first; the ones nobody has been asked
		// about sink. A stable sort keeps the server's alphabetical order inside each
		// band, so the list doesn't reshuffle unrecognisably.
		.sort((a, b) =>
			a.readiness && b.readiness
				? readinessRank(a.readiness) - readinessRank(b.readiness)
				: 0,
		);

	if (isPending) {
		return (
			<div className="grid min-h-[60vh] place-items-center text-muted-foreground">
				Loading…
			</div>
		);
	}
	// Offline with nothing downloaded there is genuinely nothing to show — say that
	// rather than spinning on a fetch that can't complete.
	if (!setlist) {
		return (
			<div className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-6 text-center">
				<div>
					<p className="text-muted-foreground">
						{online
							? "This setlist couldn't be loaded."
							: "You're offline and this setlist isn't on this device. Downloaded sets are on your offline shelf."}
					</p>
					<Button
						variant="outline"
						className="mt-4"
						render={<Link to={online ? "/setlists" : "/offline"} />}
					>
						{online ? "Back to setlists" : "Offline shelf"}
					</Button>
				</div>
			</div>
		);
	}

	// Every lineup this set could be duplicated onto, each carrying its band's name for
	// the picker's "Banda · Duo Tomi Kohy" label.
	const writableScopes = [...bands, ...(personal ? [personal] : [])];
	const cloneOptions = (lineups ?? []).flatMap((lineup) => {
		const band = writableScopes.find((s) => s.id === lineup.organizationId);
		return band ? [{ ...lineup, bandName: band.name }] : [];
	});

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

	const [downloadFailed, setDownloadFailed] = useState(false);
	const onDownload = () => {
		// `downloadSetlist` returns whether the write survived, and that return value is
		// the whole point of it: discarding it marked the set "Offline · downloaded" after
		// a quota failure, so a player found out at the venue, with no signal — precisely
		// the failure the offline feature exists to prevent (§D7, §D27).
		const ok = downloadSetlist(id, setlist);
		setDownloaded(ok);
		setDownloadFailed(!ok);
	};

	const rows = ordered.map((entry, i) =>
		online ? (
			<SortableSongRow
				key={entry.chartId}
				entry={entry}
				position={i + 1}
				onRemove={() => remove(entry.chartId)}
			/>
		) : (
			// Offline every edit is a PUT away from the server, so the row loses its grip
			// and its ✕ and gains the one thing it *can* do with no signal: open the set
			// in Live mode at this song — the fastest way to skip ahead mid-gig.
			<SongRow
				key={entry.chartId}
				entry={entry}
				position={i + 1}
				action={
					<Link
						to="/live/$id"
						params={{ id }}
						search={{ song: i }}
						aria-label={`Play ${entry.chart.song.name} in Live mode`}
						className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<IconPlayerPlay className="size-4" />
					</Link>
				}
			/>
		),
	);

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
						{setlist.songs.length} songs ·{" "}
						{lineupLabel(setlist.lineup, setlist.organization?.name)}
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{downloaded ? (
						<OfflinePill
							label="Offline"
							detail={
								syncStatus === "updated"
									? "copy just updated"
									: syncStatus === "failed"
										? "copy is out of date"
										: "setlist downloaded"
							}
						/>
					) : (
						online && (
							<Button variant="outline" onClick={onDownload}>
								<IconDownload className="size-4" /> Download for offline
							</Button>
						)
					)}
					{/* PDF is rendered by the server's chordpro CLI, and the fan session is
					    created on the server — neither exists without a connection. */}
					{online && (
						<ExportPdfButton
							songbookId={id}
							adoptJobId={exportJobId}
							disabled={!setlist.songs.length}
						/>
					)}
					{online && (
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
					)}
					<Button
						render={<Link to="/live/$id" params={{ id }} />}
						disabled={!setlist.songs.length}
					>
						<IconPlayerPlay className="size-4" /> Live mode
					</Button>
					{/* Renaming and cloning are both writes — nothing to offer offline (§D7). */}
					{online && (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button variant="outline" aria-label="More setlist actions" />
								}
							>
								<IconDotsVertical className="size-4" />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="min-w-52">
								<DropdownMenuItem onClick={() => setRenameOpen(true)}>
									<IconPencil className="size-4" /> Rename setlist
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => setCloneOpen(true)}>
									<IconCopy className="size-4" /> Duplicate to…
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			</div>

			<NamePromptDialog
				open={renameOpen}
				onOpenChange={setRenameOpen}
				title="Rename setlist"
				label="Setlist name"
				defaultValue={setlist.title}
				submitLabel="Save"
				pending={update.isPending}
				onSubmit={(title) => {
					update.mutate({ title });
					setRenameOpen(false);
				}}
			/>

			{/* Duplicating into another lineup of the same band shares the charts; into a
			    different band it forks them, so neither can edit the other's (§D25). */}
			<NamePromptDialog
				open={cloneOpen}
				onOpenChange={setCloneOpen}
				title="Duplicate setlist"
				description="Same songs, a separate set you can change on its own."
				label="New setlist name"
				defaultValue={`${setlist.title} (copy)`}
				submitLabel="Duplicate"
				pending={clone.isPending}
				onSubmit={(title) =>
					cloneTarget && clone.mutate({ targetLineupId: cloneTarget, title })
				}
			>
				<LineupPicker
					label="Duplicate to"
					lineups={cloneOptions}
					bandName={(orgId) =>
						cloneOptions.find((l) => l.organizationId === orgId)?.bandName ??
						"Band"
					}
					value={cloneTarget}
					onChange={setCloneTarget}
				/>
			</NamePromptDialog>

			{downloadFailed && (
				<p
					role="alert"
					className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
				>
					This device is out of storage, so the set was <b>not</b> downloaded —
					even after clearing older ones. Remove some sets from your offline
					shelf and try again.
				</p>
			)}

			{update.isError && (
				<p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
					{updateStatus === 403
						? "That change wasn't saved: this set contains a song from another band, which has to be forked into this one first. An admin can fix it with `bun run repair:setlists`."
						: updateStatus === 404
							? "That change wasn't saved — the setlist or one of its songs no longer exists. Reload to see the current set."
							: "That change wasn't saved. Check your connection and try again."}
				</p>
			)}

			{syncStatus === "failed" && (
				<div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
					<p className="text-destructive">
						This set has changed since you downloaded it, and the copy on this
						device couldn't be updated — storage is full or blocked.
					</p>
					<Button
						variant="outline"
						className="mt-2"
						onClick={() => {
							removeOfflineSetlist(id);
							setDownloaded(false);
						}}
					>
						Remove the old copy
					</Button>
				</div>
			)}

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

			{/* Songs — online, drag the handle on the left to reorder the set. */}
			{ordered.length === 0 ? (
				<div className="mt-6 rounded-xl border border-border px-4 py-10 text-center text-muted-foreground">
					{online
						? "No songs yet — add some below."
						: "This downloaded set has no songs."}
				</div>
			) : online ? (
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
						<div className="mt-6 rounded-xl border border-border">{rows}</div>
					</SortableContext>
				</DndContext>
			) : (
				<div className="mt-6 rounded-xl border border-border">{rows}</div>
			)}

			{/* Add songs — a search over the server's libraries plus a PUT, so online only. */}
			{online ? (
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
									placeholder="Search this band's songs and the curated library"
									autoFocus
								/>
								<Button variant="ghost" onClick={() => setAdding(false)}>
									Done
								</Button>
							</div>
							<div className="mt-3 max-h-72 overflow-auto">
								{!addable.length && (
									<p className="px-3 py-6 text-center text-sm text-muted-foreground">
										{q
											? "Nothing here — songs from your other bands have to be forked into this one first."
											: "No songs in this band's library yet."}
									</p>
								)}
								{addable.map((song) => {
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
											<span className="flex flex-wrap items-center gap-2 font-display text-sm">
												{song.name}
												<span className="text-xs text-muted-foreground">
													{song.organization?.name ?? "Curated"}
												</span>
												<ReadinessChip readiness={song.readiness} />
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
			) : (
				<p className="mt-4 text-sm text-muted-foreground">
					You're offline — editing this set needs a connection. Use ▶ to open
					the set in Live mode at that song.
				</p>
			)}
		</div>
	);
}

/**
 * One song in the set: position, title, key, and one trailing action. Presentational so
 * the same row serves the draggable online list and the plain offline one — `useSortable`
 * is a hook, so the two variants have to be separate components.
 */
function SongRow({
	entry,
	position,
	action,
	handle,
	ref,
	style,
	dragging,
}: {
	entry: SetlistEntry;
	position: number;
	action: React.ReactNode;
	handle?: React.ReactNode;
	ref?: React.Ref<HTMLDivElement>;
	style?: React.CSSProperties;
	dragging?: boolean;
}) {
	const song = entry.chart.song;
	const artist = song.credits.map((c) => c.artist.name).join(", ");

	return (
		<div
			ref={ref}
			style={style}
			className={cn(
				"flex items-center gap-3 border-b border-border bg-background px-4 py-3 first:rounded-t-xl last:rounded-b-xl last:border-0",
				dragging && "relative z-10 rounded-xl shadow-lg",
			)}
		>
			{handle}
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
			{action}
		</div>
	);
}

/**
 * The online row. `useSortable` supplies the drag transform; the listeners are bound to
 * the grip alone (not the whole row) so the title stays a link and a touch anywhere else
 * still scrolls the page — `touch-none` on the grip is what lets a finger drag it at all.
 */
function SortableSongRow({
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

	return (
		<SongRow
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			dragging={isDragging}
			entry={entry}
			position={position}
			handle={
				<button
					type="button"
					aria-label={`Reorder ${song.name}`}
					className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
					{...attributes}
					{...listeners}
				>
					<IconGripVertical className="size-4" />
				</button>
			}
			action={
				<button
					type="button"
					aria-label={`Remove ${song.name}`}
					onClick={onRemove}
					className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<IconX className="size-4" />
				</button>
			}
		/>
	);
}
