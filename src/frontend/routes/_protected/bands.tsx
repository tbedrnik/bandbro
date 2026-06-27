import { auth } from "@frontend/auth";
import { type Role, RoleBadge } from "@frontend/components/RoleBadge";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { useUser } from "@frontend/contexts/UserContext";
import { useScopes } from "@frontend/lib/scopes";
import { cn } from "@frontend/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_protected/bands")({
	component: BandsPage,
});

const ROLE_LABEL: Record<string, Role> = {
	admin: "Admin",
	writer: "Writer",
	reader: "Reader",
	owner: "Admin",
	member: "Reader",
};

type Member = {
	id: string;
	role: string;
	user: { name: string; email: string };
};

function BandsPage() {
	const me = useUser();
	const { bands } = useScopes();
	const [selected, setSelected] = useState<string | null>(null);

	useEffect(() => {
		if (!selected && bands[0]?.id) setSelected(bands[0].id);
	}, [bands, selected]);

	const { data: org, refetch } = useQuery({
		queryKey: ["org", selected],
		enabled: !!selected,
		queryFn: async () => {
			const res = await auth.organization.getFullOrganization({
				query: { organizationId: selected as string },
			});
			return res.data;
		},
	});

	const members: Member[] = (org?.members ?? []) as Member[];
	const myRole =
		members.find((m) => m.user.email === me.email)?.role ?? "reader";
	const amAdmin = myRole === "admin" || myRole === "owner";

	const [email, setEmail] = useState("");
	const [inviteRole, setInviteRole] = useState("writer");

	const invite = async () => {
		if (!email || !selected) return;
		await auth.organization.inviteMember({
			email,
			role: inviteRole as "admin" | "writer" | "reader",
			organizationId: selected,
		});
		setEmail("");
		refetch();
	};

	return (
		<div className="mx-auto max-w-5xl px-6 py-8">
			<h1 className="font-display text-3xl font-bold">Bands</h1>

			<div className="mt-6 grid gap-8 lg:grid-cols-[220px_1fr]">
				{/* Band switcher */}
				<aside>
					<div className="mb-2 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Your bands
					</div>
					<div className="flex flex-col gap-1">
						{bands.length === 0 && (
							<p className="text-sm text-muted-foreground">
								You're not in any band yet. Create one from the Home screen.
							</p>
						)}
						{bands.map((b) => (
							<button
								key={b.param}
								type="button"
								onClick={() => setSelected(b.id)}
								className={cn(
									"rounded-lg px-3 py-2 text-left font-display text-sm transition-colors",
									selected === b.id
										? "bg-foreground text-background"
										: "hover:bg-muted",
								)}
							>
								{b.name}
							</button>
						))}
					</div>
				</aside>

				{/* Members */}
				<section>
					{!selected ? (
						<p className="text-muted-foreground">Select a band.</p>
					) : (
						<>
							<div className="flex items-center justify-between">
								<h2 className="font-display text-xl font-semibold">
									{org?.name ?? "…"}
								</h2>
								<span className="text-sm text-muted-foreground">
									{members.length} members · you are {ROLE_LABEL[myRole]}
								</span>
							</div>

							{!amAdmin && (
								<p className="mt-2 text-sm text-muted-foreground">
									ⓘ Only admins can change roles or invite members.
								</p>
							)}

							<div className="mt-4 overflow-hidden rounded-xl border border-border">
								{members.map((m) => (
									<div
										key={m.id}
										className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"
									>
										<div className="grid size-9 place-items-center rounded-full bg-accent-wash font-display text-xs font-bold text-primary">
											{m.user.name.slice(0, 2).toUpperCase()}
										</div>
										<div className="flex-1">
											<div className="font-display text-sm font-medium">
												{m.user.name}
												{m.user.email === me.email && (
													<span className="ml-2 text-xs text-muted-foreground">
														you
													</span>
												)}
											</div>
											<div className="text-xs text-muted-foreground">
												{m.user.email}
											</div>
										</div>
										<RoleBadge role={ROLE_LABEL[m.role] ?? "Reader"} />
									</div>
								))}
							</div>

							{amAdmin && (
								<div className="mt-5 rounded-xl border border-border bg-card p-4">
									<div className="mb-3 font-display text-sm font-semibold">
										Invite members
									</div>
									<div className="flex flex-wrap gap-2">
										<Input
											value={email}
											onChange={(e) => setEmail(e.target.value)}
											placeholder="bandmate@email.com"
											className="flex-1"
										/>
										<select
											value={inviteRole}
											onChange={(e) => setInviteRole(e.target.value)}
											className="rounded-lg border border-border bg-background px-3 font-display text-sm"
										>
											<option value="reader">Reader</option>
											<option value="writer">Writer</option>
											<option value="admin">Admin</option>
										</select>
										<Button onClick={invite}>Send invite</Button>
									</div>
								</div>
							)}
						</>
					)}
				</section>
			</div>
		</div>
	);
}
