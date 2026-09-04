import type { BandRole } from "@backend/permissions";
import { prisma } from "@backend/prisma";
import {
	inviteStatus,
	invitesLeft,
	normalizeInviteCode,
	randomInviteCode,
} from "@shared/bandInvite";
import { HttpError, requireAdmin } from "./scope";

/**
 * Band invites without email (CLAUDE.md §D13). This deployment has no mail transport, so an
 * admin hands out a link instead: a QR held up at rehearsal, or a URL pasted into whatever
 * chat the band already uses. Redeeming it adds the caller as a `Member` with the role the
 * link carries, and records a `BandInviteUse` so the band page can show who came in through
 * which link. The validity rules themselves are pure — see `@shared/bandInvite`.
 */

const DEFAULT_EXPIRY_DAYS = 7;

async function uniqueCode(): Promise<string> {
	for (let attempt = 0; attempt < 10; attempt++) {
		const code = randomInviteCode();
		const clash = await prisma.bandInvite.findUnique({
			where: { code },
			select: { id: true },
		});
		if (!clash) return code;
	}
	throw new HttpError(500, "Could not allocate an invite code.");
}

/** Admin mints a share link for their band. */
export async function bandInvitesCreate({
	userId,
	organizationId,
	payload,
}: {
	userId: string;
	organizationId: string;
	payload: {
		role: BandRole;
		/** null = never expires. */
		expiresInDays?: number | null;
		/** null = unlimited joins. */
		maxUses?: number | null;
	};
}) {
	await requireAdmin(userId, organizationId);

	const days =
		payload.expiresInDays === undefined
			? DEFAULT_EXPIRY_DAYS
			: payload.expiresInDays;
	const expiresAt =
		days === null ? null : new Date(Date.now() + days * 86_400_000);

	const invite = await prisma.bandInvite.create({
		data: {
			code: await uniqueCode(),
			organizationId,
			role: payload.role,
			createdById: userId,
			expiresAt,
			maxUses: payload.maxUses ?? null,
		},
		select: {
			id: true,
			code: true,
			role: true,
			expiresAt: true,
			maxUses: true,
		},
	});

	return {
		id: invite.id,
		code: invite.code,
		role: invite.role,
		expiresAt: invite.expiresAt?.toISOString() ?? null,
		maxUses: invite.maxUses,
	};
}

/**
 * The band's outstanding invites, for the admin list: every link with its uses and who
 * joined through it, plus any *legacy* pending better-auth email invitations. Those email
 * rows can no longer be delivered (nothing sends mail), so they're surfaced only to be
 * seen and cancelled — the UI never creates new ones.
 */
export async function bandInvitesList({
	userId,
	organizationId,
}: {
	userId: string;
	organizationId: string;
}) {
	await requireAdmin(userId, organizationId);

	const invites = await prisma.bandInvite.findMany({
		where: { organizationId },
		orderBy: { createdAt: "desc" },
		include: {
			createdBy: { select: { name: true } },
			uses: {
				orderBy: { joinedAt: "asc" },
				include: { user: { select: { id: true, name: true } } },
			},
		},
	});

	const emailInvites = await prisma.invitation.findMany({
		where: { organizationId, status: "pending" },
		orderBy: { createdAt: "desc" },
		include: { user: { select: { name: true } } },
	});

	return {
		invites: invites.map((invite) => {
			const state = {
				expiresAt: invite.expiresAt,
				revokedAt: invite.revokedAt,
				maxUses: invite.maxUses,
				useCount: invite.uses.length,
			};
			return {
				id: invite.id,
				code: invite.code,
				role: invite.role,
				status: inviteStatus(state),
				createdBy: invite.createdBy.name,
				createdAt: invite.createdAt.toISOString(),
				expiresAt: invite.expiresAt?.toISOString() ?? null,
				maxUses: invite.maxUses,
				useCount: state.useCount,
				usesLeft: invitesLeft(state),
				joiners: invite.uses.map((use) => ({
					userId: use.userId,
					name: use.user.name,
					joinedAt: use.joinedAt.toISOString(),
				})),
			};
		}),
		emailInvites: emailInvites.map((invitation) => ({
			id: invitation.id,
			email: invitation.email,
			role: invitation.role,
			invitedBy: invitation.user.name,
			createdAt: invitation.createdAt.toISOString(),
			expiresAt: invitation.expiresAt.toISOString(),
		})),
	};
}

/** Kill a link. Kept (not deleted) so its joiners stay attributable. */
export async function bandInviteRevoke({
	userId,
	id,
}: {
	userId: string;
	id: string;
}) {
	const invite = await prisma.bandInvite.findUnique({
		where: { id },
		select: { id: true, organizationId: true, revokedAt: true },
	});
	if (!invite) throw new HttpError(404, "Invite not found.");
	await requireAdmin(userId, invite.organizationId);

	if (!invite.revokedAt) {
		await prisma.bandInvite.update({
			where: { id },
			data: { revokedAt: new Date() },
		});
	}
	return { ok: true as const };
}

/** Cancel a legacy, undeliverable email invitation. */
export async function bandEmailInviteCancel({
	userId,
	id,
}: {
	userId: string;
	id: string;
}) {
	const invitation = await prisma.invitation.findUnique({
		where: { id },
		select: { id: true, organizationId: true },
	});
	if (!invitation) throw new HttpError(404, "Invitation not found.");
	await requireAdmin(userId, invitation.organizationId);

	await prisma.invitation.update({
		where: { id },
		data: { status: "canceled" },
	});
	return { ok: true as const };
}

async function findInvite(code: string) {
	const normalized = normalizeInviteCode(code);
	const invite = await prisma.bandInvite.findUnique({
		where: { code: normalized },
		include: {
			organization: { select: { id: true, name: true } },
			_count: { select: { uses: true } },
		},
	});
	if (!invite) throw new HttpError(404, "This invite link is not valid.");
	return invite;
}

/**
 * Public, no-auth look at a code so the join page can say "Join The Wildcards as Writer"
 * *before* asking anyone to sign in. Deliberately thin: band name, offered role, validity —
 * nothing about the band's members or songs, since the code is all the caller has.
 */
export async function bandInvitePreview({ code }: { code: string }) {
	const invite = await findInvite(code);
	return {
		code: invite.code,
		band: invite.organization.name,
		role: invite.role,
		status: inviteStatus({
			expiresAt: invite.expiresAt,
			revokedAt: invite.revokedAt,
			maxUses: invite.maxUses,
			useCount: invite._count.uses,
		}),
	};
}

/**
 * Join the band. Idempotent for someone who is already a member (re-opening the link is a
 * no-op, and never spends one of its uses); an expired/revoked/used-up link is refused with
 * the reason, which the join page shows verbatim-ish.
 */
export async function bandInviteRedeem({
	userId,
	code,
}: {
	userId: string;
	code: string;
}) {
	const invite = await findInvite(code);
	const organizationId = invite.organization.id;

	const existing = await prisma.member.findFirst({
		where: { userId, organizationId },
		select: { role: true },
	});
	if (existing) {
		return {
			organizationId,
			band: invite.organization.name,
			role: existing.role,
			alreadyMember: true as const,
		};
	}

	const status = inviteStatus({
		expiresAt: invite.expiresAt,
		revokedAt: invite.revokedAt,
		maxUses: invite.maxUses,
		useCount: invite._count.uses,
	});
	if (status !== "active") {
		throw new HttpError(410, `This invite link is ${status}.`);
	}

	await prisma.$transaction([
		prisma.member.create({
			data: {
				id: crypto.randomUUID(),
				organizationId,
				userId,
				role: invite.role,
				createdAt: new Date(),
			},
		}),
		prisma.bandInviteUse.create({ data: { inviteId: invite.id, userId } }),
	]);

	return {
		organizationId,
		band: invite.organization.name,
		role: invite.role,
		alreadyMember: false as const,
	};
}
