import { api } from "@frontend/api";
import { auth } from "@frontend/auth";
import { InviteLinkPanel } from "@frontend/components/InviteLinkPanel";
import { RoleBadge, roleLabel } from "@frontend/components/RoleBadge";
import { Button } from "@frontend/components/ui/button";
import { useUser } from "@frontend/contexts/UserContext";
import { useOnline } from "@frontend/lib/offline";
import { useScopes } from "@frontend/lib/scopes";
import { cn } from "@frontend/lib/utils";
import { IconLink, IconQrcode } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_protected/bands")({
	component: BandsPage,
});

type Member = {
	id: string;
	role: string;
	user: { name: string; email: string };
};

// Wrapping the Eden query in a hook lets the row components derive their prop types from
// the real response instead of re-declaring a shape that would silently drift.
function useInvitesQuery(organizationId: string, enabled: boolean) {
	return useQuery({
		...api.bands({ organizationId }).invites.get.queryOptions({}),
		enabled,
	});
}

type InviteList = NonNullable<ReturnType<typeof useInvitesQuery>["data"]>;
type Invite = InviteList["invites"][number];
type EmailInvite = InviteList["emailInvites"][number];

function BandsPage() {
	const me = useUser();
	const { bands } = useScopes();
	const online = useOnline();
	const [selected, setSelected] = useState<string | null>(null);

	useEffect(() => {
		if (!selected && bands[0]?.id) setSelected(bands[0].id);
	}, [bands, selected]);

	const { data: org } = useQuery({
		queryKey: ["org", selected],
		enabled: !!selected && online,
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
								{online
									? "You're not in any band yet. Create one from the Home screen."
									: "You're offline — your bands are read from the server."}
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
					) : !online ? (
						// Everything on this screen — the member list, invite links, revokes —
						// is server state a band admin changes; none of it is on the device.
						<p className="text-muted-foreground">
							You're offline — members and invite links are read from the
							server. Reconnect to manage your band.
						</p>
					) : (
						<>
							<div className="flex items-center justify-between">
								<h2 className="font-display text-xl font-semibold">
									{org?.name ?? "…"}
								</h2>
								<span className="text-sm text-muted-foreground">
									{members.length} members · you are {roleLabel(myRole)}
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
										<RoleBadge role={roleLabel(m.role)} />
									</div>
								))}
							</div>

							{amAdmin && <InvitesSection organizationId={selected} />}
						</>
					)}
				</section>
			</div>
		</div>
	);
}

const EXPIRY_OPTIONS: { label: string; days: number | null }[] = [
	{ label: "24 hours", days: 1 },
	{ label: "7 days", days: 7 },
	{ label: "30 days", days: 30 },
	{ label: "Never", days: null },
];

const USE_OPTIONS: { label: string; maxUses: number | null }[] = [
	{ label: "Single use", maxUses: 1 },
	{ label: "Multi-use", maxUses: null },
];

const selectClass =
	"h-9 rounded-lg border border-border bg-background px-3 font-display text-sm";

/**
 * Invites, admin-only (CLAUDE.md §D13). Nothing here goes through email — the app has no
 * mail transport — so an admin mints a link and either holds up its QR or sends it. The list
 * below makes the outstanding links (and who came in through each) visible and revocable.
 */
function InvitesSection({ organizationId }: { organizationId: string }) {
	const queryClient = useQueryClient();
	const { data, isPending } = useInvitesQuery(organizationId, true);
	const [role, setRole] = useState("writer");
	const [expiryIdx, setExpiryIdx] = useState(1);
	const [useIdx, setUseIdx] = useState(0);
	const [fresh, setFresh] = useState<string | null>(null);

	const invalidate = () =>
		queryClient.invalidateQueries(
			api.bands({ organizationId }).invites.get.queryFilter(),
		);

	const create = useMutation({
		...api.bands({ organizationId }).invites.post.mutationOptions(),
		onSuccess: (invite) => {
			setFresh(invite.code);
			invalidate();
		},
	});

	return (
		<>
			<div className="mt-5 rounded-xl border border-border bg-card p-4">
				<div className="font-display text-sm font-semibold">
					Invite a bandmate
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					Create a link, then show its QR in person or send it over any channel.
				</p>

				<div className="mt-3 flex flex-wrap items-end gap-3">
					<label className="flex flex-col gap-1">
						<span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
							Role
						</span>
						<select
							value={role}
							onChange={(e) => setRole(e.target.value)}
							className={selectClass}
						>
							<option value="reader">Reader</option>
							<option value="writer">Writer</option>
							<option value="admin">Admin</option>
						</select>
					</label>
					<label className="flex flex-col gap-1">
						<span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
							Expires in
						</span>
						<select
							value={expiryIdx}
							onChange={(e) => setExpiryIdx(Number(e.target.value))}
							className={selectClass}
						>
							{EXPIRY_OPTIONS.map((o, i) => (
								<option key={o.label} value={i}>
									{o.label}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-1">
						<span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
							Uses
						</span>
						<select
							value={useIdx}
							onChange={(e) => setUseIdx(Number(e.target.value))}
							className={selectClass}
						>
							{USE_OPTIONS.map((o, i) => (
								<option key={o.label} value={i}>
									{o.label}
								</option>
							))}
						</select>
					</label>
					<Button
						disabled={create.isPending}
						onClick={() =>
							create.mutate({
								role: role as "admin" | "writer" | "reader",
								expiresInDays: EXPIRY_OPTIONS[expiryIdx].days,
								maxUses: USE_OPTIONS[useIdx].maxUses,
							})
						}
					>
						<IconLink className="size-4" />
						{create.isPending ? "Creating…" : "Create invite link"}
					</Button>
				</div>

				{fresh && (
					<div className="mt-4">
						<InviteLinkPanel code={fresh} />
					</div>
				)}
			</div>

			<div className="mt-5">
				<div className="mb-2 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Invite links
				</div>
				{isPending ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : !data?.invites.length ? (
					<p className="text-sm text-muted-foreground">No invite links yet.</p>
				) : (
					<div className="flex flex-col gap-2">
						{data.invites.map((invite) => (
							<InviteRow
								key={invite.id}
								invite={invite}
								organizationId={organizationId}
							/>
						))}
					</div>
				)}
			</div>

			{!!data?.emailInvites.length && (
				<div className="mt-5">
					<div className="mb-2 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Email invites
					</div>
					<div className="flex flex-col gap-2">
						{data.emailInvites.map((invite) => (
							<EmailInviteRow
								key={invite.id}
								invite={invite}
								organizationId={organizationId}
							/>
						))}
					</div>
				</div>
			)}
		</>
	);
}

const STATUS_LABEL: Record<Invite["status"], string> = {
	active: "Active",
	revoked: "Revoked",
	expired: "Expired",
	exhausted: "Used up",
};

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function InviteRow({
	invite,
	organizationId,
}: {
	invite: Invite;
	organizationId: string;
}) {
	const queryClient = useQueryClient();
	const [showQr, setShowQr] = useState(false);

	const revoke = useMutation({
		...api.bands.invites({ id: invite.id }).delete.mutationOptions(),
		onSuccess: () =>
			queryClient.invalidateQueries(
				api.bands({ organizationId }).invites.get.queryFilter(),
			),
	});

	const active = invite.status === "active";

	return (
		<div className="rounded-xl border border-border bg-card p-4">
			<div className="flex flex-wrap items-center gap-3">
				<span className="rounded-lg bg-secondary px-3 py-1.5 font-mono text-sm font-semibold tracking-[0.08em]">
					{invite.code}
				</span>
				<RoleBadge role={roleLabel(invite.role)} />
				<span
					className={cn(
						"font-mono text-[10px] uppercase tracking-[0.12em]",
						active ? "text-[var(--ok)]" : "text-muted-foreground",
					)}
				>
					{STATUS_LABEL[invite.status]}
				</span>
				<div className="ml-auto flex items-center gap-2">
					{active && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setShowQr((v) => !v)}
						>
							<IconQrcode className="size-4" />
							{showQr ? "Hide QR" : "Show QR"}
						</Button>
					)}
					{active && (
						<Button
							variant="ghost"
							size="sm"
							disabled={revoke.isPending}
							onClick={() => revoke.mutate({})}
						>
							Revoke
						</Button>
					)}
				</div>
			</div>

			<div className="mt-2 text-xs text-muted-foreground">
				Created by {invite.createdBy} on {formatDate(invite.createdAt)} ·{" "}
				{invite.expiresAt
					? `expires ${formatDate(invite.expiresAt)}`
					: "never expires"}{" "}
				·{" "}
				{invite.usesLeft === null
					? `${invite.useCount} used, unlimited`
					: `${invite.useCount} of ${invite.maxUses} used, ${invite.usesLeft} left`}
			</div>

			{invite.joiners.length > 0 && (
				<div className="mt-2 text-xs">
					<span className="text-muted-foreground">Joined: </span>
					{invite.joiners
						.map((j) => `${j.name} (${formatDate(j.joinedAt)})`)
						.join(", ")}
				</div>
			)}

			{showQr && (
				<div className="mt-3">
					<InviteLinkPanel code={invite.code} />
				</div>
			)}
		</div>
	);
}

/**
 * A pending better-auth `Invitation` from before §D13. Nothing can deliver it, so it is
 * shown only to be recognised and cancelled — the UI never creates new ones.
 */
function EmailInviteRow({
	invite,
	organizationId,
}: {
	invite: EmailInvite;
	organizationId: string;
}) {
	const queryClient = useQueryClient();
	const cancel = useMutation({
		...api.bands["email-invites"]({ id: invite.id }).delete.mutationOptions(),
		onSuccess: () =>
			queryClient.invalidateQueries(
				api.bands({ organizationId }).invites.get.queryFilter(),
			),
	});

	return (
		<div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-card p-4">
			<div className="min-w-0 flex-1">
				<div className="font-display text-sm font-medium">{invite.email}</div>
				<div className="text-xs text-muted-foreground">
					Email invite (undeliverable — this app can't send mail) · invited by{" "}
					{invite.invitedBy} on {formatDate(invite.createdAt)}
				</div>
			</div>
			<RoleBadge role={roleLabel(invite.role)} />
			<Button
				variant="ghost"
				size="sm"
				disabled={cancel.isPending}
				onClick={() => cancel.mutate({})}
			>
				Cancel
			</Button>
		</div>
	);
}
