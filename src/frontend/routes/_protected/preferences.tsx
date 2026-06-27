import { auth } from "@frontend/auth";
import { CapoToggle } from "@frontend/components/CapoToggle";
import { RoleBadge } from "@frontend/components/RoleBadge";
import { useUser } from "@frontend/contexts/UserContext";
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
					<div className="grid size-12 place-items-center rounded-full bg-accent-wash font-display text-lg font-bold text-primary">
						{user.name.slice(0, 2).toUpperCase()}
					</div>
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
				<div className="mt-4 flex items-center gap-4">
					<CapoToggle value={view} onValueChange={onChangeView} />
					{saved && <span className="font-mono text-xs text-ok">✓ saved</span>}
				</div>
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
