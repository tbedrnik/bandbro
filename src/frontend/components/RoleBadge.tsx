import { cn } from "@frontend/lib/utils";

/** A member's permission level within a band (see PRD §9). */
export type Role = "Admin" | "Writer" | "Reader";

/**
 * A stored `Member.role` as a badge label. better-auth's own defaults (owner/member) predate
 * the §D6 roles and still turn up on older rows, so they map onto the nearest equivalent.
 */
export function roleLabel(role: string | null | undefined): Role {
	if (role === "admin" || role === "owner") return "Admin";
	if (role === "writer") return "Writer";
	return "Reader";
}

/**
 * Member role badge. Admin is emphasized with the brand accent wash; Writer and
 * Reader are quiet neutral chips. Ported from Claude Design "Design System.dc.html".
 */
export function RoleBadge({
	role,
	className,
}: {
	role: Role;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"rounded-md px-2 py-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.05em]",
				role === "Admin"
					? "bg-accent-wash text-primary"
					: "bg-secondary text-muted-foreground",
				className,
			)}
		>
			{role}
		</span>
	);
}
