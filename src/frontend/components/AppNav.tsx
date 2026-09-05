import { UserAvatar } from "@frontend/components/UserAvatar";
import {
	Drawer,
	DrawerContent,
	DrawerTitle,
} from "@frontend/components/ui/drawer";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@frontend/components/ui/dropdown-menu";
import { useUser } from "@frontend/contexts/UserContext";
import { useOnline } from "@frontend/lib/offline";
import { useSignOut } from "@frontend/lib/signOut";
import { useTheme } from "@frontend/lib/theme";
import { cn } from "@frontend/lib/utils";
import {
	IconHome,
	IconLogout,
	IconMenu2,
	IconMoon,
	IconMusic,
	IconPlaylist,
	IconSettings,
	IconSun,
	IconUsers,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

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

const SECTIONS = [
	{ to: "/", label: "Home", icon: IconHome },
	{ to: "/library", label: "Library", icon: IconMusic },
	{ to: "/setlists", label: "Setlists", icon: IconPlaylist },
	{ to: "/bands", label: "Bands", icon: IconUsers },
] as const;

/**
 * Top navigation bar shared by all authoring screens (F11).
 *
 * The four section links only fit a desktop row, so below `md` they move into a bottom
 * sheet behind a hamburger. A sheet rather than a dropdown because this is the one piece
 * of chrome a player touches on a phone with a guitar in the other hand: full-width rows
 * with real tap targets beat a pointer-sized anchored menu, and it reuses the same `vaul`
 * drawer the fan view already performs from. The wordmark and the theme toggle stay in
 * the bar at every width (the toggle drops its label under `sm`), and the current section
 * is named in the bar *and* highlighted in the sheet, so "where am I" survives the move.
 */
export function AppNav({ section }: { section?: string }) {
	const { theme, toggle } = useTheme();
	// Optional: the layout renders this behind a session guard, but an offline boot runs
	// on the session snapshot (§D7) and a nav that throws would take the app down with it.
	const user = useUser({ optional: true });
	const [menuOpen, setMenuOpen] = useState(false);
	// No colour in the base class: `text-muted-foreground` and the active
	// `text-foreground` are the same Tailwind property, so whichever the stylesheet
	// happens to emit last wins and the active link never actually lit up. Split the
	// two states across activeProps/inactiveProps instead.
	const link = "font-display text-sm font-medium transition-colors";

	return (
		<header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:gap-6 sm:px-6">
			{/* Logo + links form one stable left cluster so the nav never shifts as
			    you navigate. The current section moves to the right, by the toggle. */}
			<Wordmark />
			<nav className="hidden items-center gap-5 md:flex">
				{SECTIONS.map((s) => (
					<Link
						key={s.to}
						to={s.to}
						className={link}
						// "/" is a prefix of every route, so Home needs exact matching or it
						// reads as the active section everywhere.
						activeOptions={{ exact: s.to === "/" }}
						activeProps={{ className: "text-foreground" }}
						inactiveProps={{
							className: "text-muted-foreground hover:text-foreground",
						}}
					>
						{s.label}
					</Link>
				))}
			</nav>
			<div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-4">
				{section && (
					<span className="truncate font-display text-sm text-muted-foreground">
						{section}
					</span>
				)}
				<button
					type="button"
					onClick={toggle}
					aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
					className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1.5 font-display text-[13px] font-medium transition-colors hover:bg-muted sm:px-3"
				>
					{theme === "dark" ? (
						<IconMoon className="size-4 text-primary" />
					) : (
						<IconSun className="size-4 text-primary" />
					)}
					<span className="hidden sm:inline">
						{theme === "dark" ? "Dark" : "Light"}
					</span>
				</button>
				{user && <AccountMenu name={user.name} email={user.email} />}
				<button
					type="button"
					onClick={() => setMenuOpen(true)}
					aria-label="Open menu"
					className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-card transition-colors hover:bg-muted md:hidden"
				>
					<IconMenu2 className="size-4" />
				</button>
			</div>

			<Drawer open={menuOpen} onOpenChange={setMenuOpen}>
				<DrawerContent className="md:hidden">
					<div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-border" />
					<DrawerTitle className="px-5 pt-4 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Go to
					</DrawerTitle>
					<nav className="flex flex-col px-3 pb-8 pt-2">
						{SECTIONS.map((s) => (
							<Link
								key={s.to}
								to={s.to}
								// Closing on tap rather than on a route change keeps the sheet
								// honest when the destination is the page you're already on.
								onClick={() => setMenuOpen(false)}
								activeOptions={{ exact: s.to === "/" }}
								className="flex items-center gap-3 rounded-xl px-4 py-3.5 font-display text-base font-medium transition-colors"
								activeProps={{ className: "bg-secondary text-foreground" }}
								inactiveProps={{
									className: "text-muted-foreground hover:bg-muted",
								}}
							>
								<s.icon className="size-5 text-primary" />
								{s.label}
							</Link>
						))}
					</nav>
				</DrawerContent>
			</Drawer>
		</header>
	);
}

/**
 * The account menu behind the avatar — the way to Preferences (which isn't one of the
 * four sections, so it has no other entry point) and the way out.
 *
 * A menu rather than a plain link because sign-out has to live somewhere reachable from
 * every screen, and the avatar is the one piece of chrome that already means "you". It
 * stays a dropdown at every width instead of joining the mobile sheet of §D16: the sheet
 * answers "which section", this answers "which account", and two items don't need a
 * full-width surface.
 */
function AccountMenu({ name, email }: { name: string; email: string }) {
	const online = useOnline();
	const { signOut, pending, failed } = useSignOut();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						aria-label="Account"
						className="rounded-full transition-opacity hover:opacity-80"
					>
						<UserAvatar name={name} />
					</button>
				}
			/>
			<DropdownMenuContent align="end" className="min-w-56">
				<div className="flex items-center gap-3 px-2 py-2">
					<UserAvatar name={name} size="sm" />
					<div className="min-w-0">
						<div className="truncate font-display text-sm font-semibold">
							{name}
						</div>
						<div className="truncate text-xs text-muted-foreground">
							{email}
						</div>
					</div>
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuItem render={<Link to="/preferences" />}>
					<IconSettings className="size-4" /> Profile &amp; preferences
				</DropdownMenuItem>
				{/* Only the server can clear an httpOnly session cookie, so offline this
				    button could not do what it says — hide it rather than lie (§D7). */}
				{online && (
					<DropdownMenuItem
						variant="destructive"
						disabled={pending}
						// Keep the menu open on failure so the retry label is actually read.
						closeOnClick={false}
						onClick={() => void signOut()}
					>
						<IconLogout className="size-4" />
						{failed ? "Couldn't sign out — retry" : "Sign out"}
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
