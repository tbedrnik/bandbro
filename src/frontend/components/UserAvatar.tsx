import { cn } from "@frontend/lib/utils";
import { initials } from "@shared/initials";

/**
 * The account's initials in an accent circle — the one thing in the chrome that says
 * *who* is signed in, and (in the nav) the way to Preferences.
 *
 * There is no uploaded-image avatar in BandBro, so this is not a fallback for a missing
 * photo: it is the avatar. The landing page draws the same circle from a cookie hint
 * (CLAUDE.md §D22) in its own hand-written markup, which is why `initials` is shared.
 */
export function UserAvatar({
	name,
	size = "md",
	className,
}: {
	name: string;
	size?: "sm" | "md" | "lg";
	className?: string;
}) {
	return (
		<span
			aria-hidden
			className={cn(
				"grid shrink-0 place-items-center rounded-full bg-accent-wash font-display font-bold text-primary",
				size === "sm" && "size-8 text-xs",
				size === "md" && "size-9 text-sm",
				size === "lg" && "size-12 text-lg",
				className,
			)}
		>
			{initials(name)}
		</span>
	);
}
