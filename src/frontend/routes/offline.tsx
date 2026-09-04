import { Wordmark } from "@frontend/components/AppNav";
import { OfflinePill } from "@frontend/components/OfflinePill";
import { Button } from "@frontend/components/ui/button";
import {
	removeOfflineSetlist,
	useOfflineSetlists,
	useOnline,
} from "@frontend/lib/offline";
import { useTheme } from "@frontend/lib/theme";
import {
	IconMusic,
	IconPlayerPlay,
	IconPlaylist,
	IconTrash,
} from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/offline")({
	component: OfflineShelf,
});

/**
 * The offline shelf (CLAUDE.md §D7) — every setlist downloaded to this device, openable
 * straight into Live mode.
 *
 * Deliberately outside `_protected`: it reads nothing but localStorage, so it must not
 * sit behind a session check that itself needs the network. It is also where the
 * protected layout sends a player who arrives with no signal and no cached session.
 */
function OfflineShelf() {
	useTheme();
	const online = useOnline();
	const setlists = useOfflineSetlists();

	return (
		<div className="min-h-dvh bg-background text-foreground">
			<header className="flex h-14 items-center gap-4 border-b border-border px-6">
				<Wordmark />
				<span className="font-display text-sm text-muted-foreground">
					Offline
				</span>
				<div className="ml-auto">
					{online ? (
						<Button variant="outline" render={<Link to="/" />}>
							Back online — open BandBro
						</Button>
					) : (
						<span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5">
							<span className="size-2 rounded-full bg-[#c0392b]" />
							<span className="font-mono text-xs">No signal</span>
						</span>
					)}
				</div>
			</header>

			<div className="mx-auto max-w-3xl px-6 py-10">
				<h1 className="font-display text-3xl font-bold">On this device</h1>
				<p className="mt-2 max-w-xl text-sm text-muted-foreground">
					These setlists were downloaded for offline use. They play in Live mode
					with no signal — chords, keys, capo and transpose all work from the
					copy stored here.
				</p>

				{setlists.length === 0 ? (
					<div className="mt-8 rounded-xl border border-dashed border-border px-6 py-12 text-center">
						<IconMusic className="mx-auto size-6 text-muted-foreground" />
						<div className="mt-3 font-display font-medium">
							Nothing downloaded yet
						</div>
						<p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
							Open a setlist while you have signal and choose “Download for
							offline”, and it will be waiting here on the night.
						</p>
						{online && (
							<Button className="mt-5" render={<Link to="/setlists" />}>
								Browse setlists
							</Button>
						)}
					</div>
				) : (
					<div className="mt-8 flex flex-col gap-3">
						{setlists.map((s) => (
							<div
								key={s.id}
								className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5"
							>
								<IconPlaylist className="size-5 text-primary" />
								<div className="min-w-40 flex-1">
									<div className="font-display text-lg font-semibold">
										{s.title}
									</div>
									<div className="mt-1 font-mono text-xs text-muted-foreground">
										{s.songCount} songs
										{s.downloadedAt > 0 &&
											` · downloaded ${formatDownloadedAt(s.downloadedAt)}`}
									</div>
								</div>
								<OfflinePill label="Ready" detail="no signal needed" />
								<Button render={<Link to="/live/$id" params={{ id: s.id }} />}>
									<IconPlayerPlay className="size-4" /> Live mode
								</Button>
								<Button
									variant="outline"
									aria-label={`Remove ${s.title} from this device`}
									onClick={() => removeOfflineSetlist(s.id)}
								>
									<IconTrash className="size-4" />
								</Button>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

/** Coarse "how fresh is this copy" — the exact minute never matters on a stage. */
function formatDownloadedAt(at: number) {
	const days = Math.floor((Date.now() - at) / 86_400_000);
	if (days < 1) return "today";
	if (days === 1) return "yesterday";
	if (days < 30) return `${days} days ago`;
	return new Date(at).toLocaleDateString();
}
