import { useTheme } from "@frontend/lib/theme";
import { cn } from "@frontend/lib/utils";
import { IconMoon, IconSun } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

/** The BandBro wordmark — "Bro" in the warm accent. */
export function Wordmark({ className }: { className?: string }) {
	return (
		<Link
			to="/"
			className={cn("font-display text-lg font-bold tracking-tight", className)}
		>
			Band<span className="text-primary">Bro</span>
		</Link>
	);
}

/** Top navigation bar shared by all desktop authoring screens (F11). */
export function AppNav({ section }: { section?: string }) {
	const { theme, toggle } = useTheme();
	const link =
		"font-display text-sm font-medium text-muted-foreground hover:text-foreground transition-colors";

	return (
		<header className="sticky top-0 z-20 flex h-14 items-center gap-6 border-b border-border bg-background/90 px-6 backdrop-blur">
			{/* Logo + links form one stable left cluster so the nav never shifts as
			    you navigate. The current section moves to the right, by the toggle. */}
			<Wordmark />
			<nav className="flex items-center gap-5">
				<Link
					to="/"
					className={link}
					activeProps={{ className: "text-foreground" }}
				>
					Home
				</Link>
				<Link
					to="/library"
					className={link}
					activeProps={{ className: "text-foreground" }}
				>
					Library
				</Link>
				<Link
					to="/setlists"
					className={link}
					activeProps={{ className: "text-foreground" }}
				>
					Setlists
				</Link>
				<Link
					to="/bands"
					className={link}
					activeProps={{ className: "text-foreground" }}
				>
					Bands
				</Link>
			</nav>
			<div className="ml-auto flex items-center gap-4">
				{section && (
					<span className="font-display text-sm text-muted-foreground">
						{section}
					</span>
				)}
				<button
					type="button"
					onClick={toggle}
					className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 font-display text-[13px] font-medium transition-colors hover:bg-muted"
				>
					{theme === "dark" ? (
						<IconMoon className="size-4 text-primary" />
					) : (
						<IconSun className="size-4 text-primary" />
					)}
					{theme === "dark" ? "Dark" : "Light"}
				</button>
			</div>
		</header>
	);
}
