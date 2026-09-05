import { auth } from "@frontend/auth";
import { CapoToggle } from "@frontend/components/CapoToggle";
import { RoleBadge } from "@frontend/components/RoleBadge";
import { UserAvatar } from "@frontend/components/UserAvatar";
import { Button } from "@frontend/components/ui/button";
import { useUser } from "@frontend/contexts/UserContext";
import { useOnline } from "@frontend/lib/offline";
import { usePushNotifications } from "@frontend/lib/push";
import { useScopes } from "@frontend/lib/scopes";
import { useTheme } from "@frontend/lib/theme";
import { cn } from "@frontend/lib/utils";
import type { ChordView } from "@shared/transpose";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_protected/preferences")({
	component: PreferencesPage,
});

function PreferencesPage() {
	const user = useUser();
	const { theme, setTheme } = useTheme();
	const { bands, personal } = useScopes();
	const online = useOnline();
	const [view, setView] = useState<ChordView>(
		(user.defaultChordView as ChordView) ?? "fingered",
	);
	const [saved, setSaved] = useState(false);

	const onChangeView = async (next: ChordView) => {
		setView(next);
		await auth.updateUser({ defaultChordView: next });
		setSaved(true);
		setTimeout(() => setSaved(false), 1500);
	};

	return (
		<div className="mx-auto max-w-2xl px-6 py-10">
			<h1 className="font-display text-3xl font-bold">
				Profile &amp; preferences
			</h1>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<div className="flex items-center gap-4">
					<UserAvatar name={user.name} size="lg" />
					<div>
						<div className="font-display font-semibold">{user.name}</div>
						<div className="text-sm text-muted-foreground">{user.email}</div>
					</div>
				</div>
			</section>

			<section className="mt-6 rounded-xl border border-border bg-card p-6">
				<h2 className="font-display text-lg font-semibold">
					Default chord view
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Which view loads first whenever you open a song. Capo players read the
					shapes they finger; bass &amp; keys read the notes that actually
					sound. You can always flip it per song.
				</p>
				{/* The toggle writes the preference to the account, so offline it would
				    silently fail to stick — hide it rather than lie (§D7). Theme, below,
				    is per-device and keeps working. */}
				{online ? (
					<div className="mt-4 flex items-center gap-4">
						<CapoToggle value={view} onValueChange={onChangeView} />
						{saved && (
							<span className="font-mono text-xs text-ok">✓ saved</span>
						)}
					</div>
				) : (
					<p className="mt-4 text-sm text-muted-foreground">
						You're offline — changing this setting needs a connection. It's
						currently{" "}
						<span className="font-mono text-foreground">
							{view === "concert" ? "concert" : "as-fingered"}
						</span>
						.
					</p>
				)}
				<div className="mt-5 rounded-lg bg-secondary p-4 font-mono text-sm">
					<div className="mb-1 text-xs uppercase text-muted-foreground">
						Example · capo 2
					</div>
					<div>As-fingered: C G Am F</div>
					<div>Concert: D A Bm G</div>
				</div>
			</section>

			<section className="mt-6 rounded-xl border border-border bg-card p-6">
				<h2 className="font-display text-lg font-semibold">Appearance</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Dark theme is handy for dim stages in Live mode.
				</p>
				<div className="mt-4 inline-flex gap-1 rounded-[11px] bg-secondary p-1">
					{(["light", "dark"] as const).map((t) => (
						<button
							key={t}
							type="button"
							onClick={() => setTheme(t)}
							className={cn(
								"rounded-lg px-4 py-2 font-display text-sm capitalize transition-colors",
								theme === t
									? "bg-primary font-semibold text-primary-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{t}
						</button>
					))}
				</div>
			</section>

			<PushSection />

			<section className="mt-6 rounded-xl border border-border bg-card p-6">
				<h2 className="font-display text-lg font-semibold">Band memberships</h2>
				<div className="mt-4 flex flex-col gap-2">
					{[...bands, ...(personal ? [personal] : [])].map((scope) => (
						<div
							key={scope.param}
							className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5"
						>
							<span className="font-display text-sm font-medium">
								{scope.name}
							</span>
							<RoleBadge role="Admin" />
						</div>
					))}
				</div>
			</section>
		</div>
	);
}

/**
 * Notifications opt-in (CLAUDE.md §D21). One switch and one test button — there is
 * exactly one thing BandBro notifies about (a finished setlist PDF), so a preference
 * matrix would be four screens of chrome around a single boolean.
 *
 * Every unavailable state says *why*, because they have completely different remedies:
 * a denied permission can only be undone in the browser's own site settings, an iPhone
 * needs the app installed to the home screen first, and an unconfigured server needs
 * VAPID keys. A greyed-out switch would say none of that.
 */
function PushSection() {
	const push = usePushNotifications();

	if (push.support === "unconfigured") return null;

	return (
		<section className="mt-6 rounded-xl border border-border bg-card p-6">
			<h2 className="font-display text-lg font-semibold">Notifications</h2>
			<p className="mt-1 text-sm text-muted-foreground">
				A setlist PDF takes a few minutes to render, and by then you've usually
				put the phone down. Let BandBro tell you when it's ready.
			</p>

			{push.support === "unsupported" ? (
				<p className="mt-4 text-sm text-muted-foreground">
					{push.needsInstall
						? "On iPhone and iPad, notifications only work once BandBro is added to the home screen — open the Share menu and choose “Add to Home Screen”, then come back here."
						: "This browser doesn't support notifications."}
				</p>
			) : push.permission === "denied" ? (
				<p className="mt-4 text-sm text-muted-foreground">
					Notifications are blocked for BandBro in this browser. Only its site
					settings can undo that — look for the icon at the left of the address
					bar.
				</p>
			) : push.subscribed ? (
				<div className="mt-4 flex flex-wrap items-center gap-3">
					<span className="font-mono text-xs text-ok">
						✓ on for this device
					</span>
					<Button
						variant="outline"
						disabled={push.busy}
						onClick={() => void push.sendTest()}
					>
						Send a test
					</Button>
					<Button
						variant="ghost"
						disabled={push.busy}
						onClick={() => void push.disable()}
					>
						Turn off
					</Button>
				</div>
			) : (
				<div className="mt-4">
					<Button disabled={push.busy} onClick={() => void push.enable()}>
						Turn on notifications
					</Button>
					<p className="mt-2 text-xs text-muted-foreground">
						Per device — turn it on again on any other phone or laptop you use.
					</p>
				</div>
			)}

			{push.error && (
				<p className="mt-3 font-mono text-xs text-destructive">{push.error}</p>
			)}
		</section>
	);
}
