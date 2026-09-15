import { Button } from "@frontend/components/ui/button";
import { Link } from "@tanstack/react-router";

/**
 * What a crash looks like (CLAUDE.md §D27).
 *
 * Wired as the router's `defaultErrorComponent`, so any render-time throw lands here
 * instead of unmounting the app to a blank page. That mattered most in the one place the
 * app is hardest to recover: an installed PWA on a stand at a gig, where "white screen"
 * means force-quitting an app the player may not know how to force-quit.
 *
 * Deliberately offers *two* ways out — reset re-renders the route (enough for a transient
 * failure), reload re-boots the shell (enough for a stale bundle) — and a link home, which
 * is the only one that works if the route itself is what's broken.
 */
export function AppError({
	error,
	reset,
}: {
	error: Error;
	reset?: () => void;
}) {
	return (
		<div className="grid min-h-dvh place-items-center bg-background px-6 text-center">
			<div className="max-w-md">
				<h1 className="font-display text-xl font-bold text-foreground">
					Something broke on this screen
				</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					The rest of the app is fine. If you're mid-gig, your downloaded
					setlists are still on this device.
				</p>
				{error?.message && (
					<p className="mt-3 rounded-lg bg-card px-3 py-2 text-left font-mono text-xs break-words text-muted-foreground">
						{error.message}
					</p>
				)}
				<div className="mt-5 flex flex-wrap justify-center gap-2">
					{reset && (
						<Button variant="outline" onClick={reset}>
							Try again
						</Button>
					)}
					<Button
						variant="outline"
						onClick={() => {
							window.location.reload();
						}}
					>
						Reload
					</Button>
					<Button render={<Link to="/offline" />}>Your offline sets</Button>
				</div>
			</div>
		</div>
	);
}
