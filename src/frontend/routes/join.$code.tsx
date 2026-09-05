import { api } from "@frontend/api";
import {
	type Role,
	RoleBadge,
	roleLabel,
} from "@frontend/components/RoleBadge";
import { SiteFooter } from "@frontend/components/SiteFooter";
import { Button } from "@frontend/components/ui/button";
import { useSession } from "@frontend/contexts/SessionContext";
import { normalizeInviteCode } from "@shared/bandInvite";
import { IconCheck, IconUsers } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/join/$code")({
	component: JoinPage,
});

const DEAD_INVITE: Record<string, string> = {
	expired: "This invite link has expired.",
	revoked: "This invite link was revoked.",
	exhausted: "This invite link has already been used.",
};

/**
 * Public join page for a band invite link (CLAUDE.md §D13). Reached by scanning the admin's
 * QR or opening a pasted link, so it must render without a session: the preview names the
 * band and the role on offer *before* anyone signs in, and the sign-in links carry a
 * `redirect` back here so the visitor lands on the join button rather than the app home.
 */
function JoinPage() {
	const { code } = Route.useParams();
	const normalized = normalizeInviteCode(code);
	const session = useSession({ optional: true });
	const navigate = useNavigate();

	const { data, isPending, isError } = useQuery({
		...api.bands.join({ code: normalized }).get.queryOptions({}),
		retry: false,
	});

	const redeem = useMutation({
		...api.bands.join({ code: normalized }).post.mutationOptions(),
		onSuccess: () => navigate({ to: "/bands" }),
	});

	const role: Role = roleLabel(data?.role);
	const dead =
		data && data.status !== "active" ? DEAD_INVITE[data.status] : null;

	return (
		<div className="flex min-h-dvh flex-col bg-background text-foreground">
			<div className="grid flex-1 place-items-center px-6 py-10">
				<div className="w-full max-w-[400px] text-center">
					<div className="font-display text-[22px] font-bold tracking-[-0.02em]">
						Band<span className="text-primary">Bro</span>
					</div>

					<div className="mt-8 rounded-2xl border border-border bg-card p-7">
						{isPending ? (
							<p className="font-mono text-sm text-muted-foreground">
								Checking the invite…
							</p>
						) : isError || !data ? (
							<>
								<h1 className="font-display text-xl font-bold">
									This invite link isn't valid
								</h1>
								<p className="mt-2 text-sm text-muted-foreground">
									Check the code with whoever sent it — or ask them for a fresh
									link.
								</p>
								<Link
									to="/join"
									className="mt-5 inline-block font-display text-sm font-semibold text-primary"
								>
									Enter a code by hand
								</Link>
							</>
						) : dead ? (
							<>
								<h1 className="font-display text-xl font-bold">{dead}</h1>
								<p className="mt-2 text-sm text-muted-foreground">
									Ask an admin of {data.band} for a new one.
								</p>
							</>
						) : (
							<>
								<div className="mx-auto grid size-12 place-items-center rounded-full bg-accent-wash text-primary">
									<IconUsers className="size-6" />
								</div>
								<div className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
									You're invited to join
								</div>
								<h1 className="mt-1 font-display text-2xl font-bold">
									{data.band}
								</h1>
								<div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
									as <RoleBadge role={role} />
								</div>

								{session ? (
									<>
										<Button
											className="mt-6 w-full"
											disabled={redeem.isPending}
											onClick={() => redeem.mutate({})}
										>
											{redeem.isPending ? (
												"Joining…"
											) : (
												<>
													<IconCheck className="size-4" /> Join {data.band}
												</>
											)}
										</Button>
										{redeem.isError && (
											<p className="mt-3 text-sm text-destructive">
												That didn't work — the link may have just expired or
												been used up.
											</p>
										)}
									</>
								) : (
									<>
										<p className="mt-5 text-sm text-muted-foreground">
											Sign in (or create an account) and you'll come straight
											back here.
										</p>
										<div className="mt-4 flex flex-col gap-2">
											<Button
												className="w-full"
												render={
													<Link
														to="/register"
														search={{ redirect: `/join/${normalized}` }}
													/>
												}
											>
												Create an account
											</Button>
											<Button
												variant="outline"
												className="w-full"
												render={
													<Link
														to="/login"
														search={{ redirect: `/join/${normalized}` }}
													/>
												}
											>
												I already have one
											</Button>
										</div>
									</>
								)}
							</>
						)}
					</div>

					<div className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
						Invite code · {normalized}
					</div>
				</div>
			</div>

			<SiteFooter />
		</div>
	);
}
