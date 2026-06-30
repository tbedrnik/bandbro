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
import {
	IconArrowDown,
	IconArrowUp,
	IconDownload,
	IconFileTypePdf,
	IconPlayerPlay,
	IconPlus,
	IconShare3,
	IconX,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_protected/setlists/$id")({
	component: SetlistDetail,
});

function SetlistDetail() {
	const { id } = Route.useParams();
	const queryClient = useQueryClient();
	const [adding, setAdding] = useState(false);
	const [q, setQ] = useState("");
	const [downloaded, setDownloaded] = useState(() => isDownloaded(id));
	const [shareOpen, setShareOpen] = useState(false);
	const fan = useFanSession(id);

	const { data: setlist, isPending } = useQuery(
		api.songbooks({ id }).get.queryOptions({}),
	);

	const update = useMutation({
		...api.songbooks({ id }).put.mutationOptions(),
		onSuccess: () =>
			queryClient.invalidateQueries(api.songbooks.get.queryFilter()),
	});

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

	const chartIds = setlist.songs.map((s) => s.chartId);

	const reorder = (from: number, to: number) => {
		if (to < 0 || to >= chartIds.length) return;
		const next = [...chartIds];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		update.mutate({ chartIds: next });
	};
	const remove = (chartId: string) =>
		update.mutate({ chartIds: chartIds.filter((c) => c !== chartId) });
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

			{/* Songs */}
			<div className="mt-6 overflow-hidden rounded-xl border border-border">
				{setlist.songs.length === 0 ? (
					<div className="px-4 py-10 text-center text-muted-foreground">
						No songs yet — add some below.
					</div>
				) : (
					setlist.songs.map((entry, i) => {
						const song = entry.chart.song;
						const artist = song.credits.map((c) => c.artist.name).join(", ");
						return (
							<div
								key={entry.chartId}
								className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"
							>
								<span className="w-6 text-center font-mono text-sm text-muted-foreground">
									{i + 1}
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
										value={entry.chart.key}
										className="px-2 py-1"
									/>
								)}
								<div className="flex gap-1">
									<IconBtn label="Up" onClick={() => reorder(i, i - 1)}>
										<IconArrowUp className="size-4" />
									</IconBtn>
									<IconBtn label="Down" onClick={() => reorder(i, i + 1)}>
										<IconArrowDown className="size-4" />
									</IconBtn>
									<IconBtn label="Remove" onClick={() => remove(entry.chartId)}>
										<IconX className="size-4" />
									</IconBtn>
								</div>
							</div>
						);
					})
				)}
			</div>

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

function IconBtn({
	children,
	label,
	onClick,
}: {
	children: React.ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onClick}
			className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
		>
			{children}
		</button>
	);
}
