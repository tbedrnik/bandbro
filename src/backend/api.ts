import { serverTiming } from "@elysiajs/server-timing";
import { Elysia, t } from "elysia";
import { CreditRole } from "../generated/prisma/enums";
import { authMiddleware } from "./auth";
import { prisma } from "./prisma";
import {
	bandEmailInviteCancel,
	bandInvitePreview,
	bandInviteRedeem,
	bandInviteRevoke,
	bandInvitesCreate,
	bandInvitesList,
} from "./services/bandInvites";
import {
	liveSessionCreate,
	liveSessionPublicRead,
	liveSessionSetCurrent,
} from "./services/liveSessions";
import {
	pdfExportCreate,
	pdfExportFile,
	pdfExportRead,
} from "./services/pdfExports";
import {
	pushPublicKey,
	pushStatus,
	pushSubscribe,
	pushTest,
	pushUnsubscribe,
} from "./services/push";
import { HttpError } from "./services/scope";
import { songbooksCreate } from "./services/songbooksCreate";
import { songbooksDelete } from "./services/songbooksDelete";
import { songbooksList } from "./services/songbooksList";
import { songbooksRead } from "./services/songbooksRead";
import { songbooksUpdate } from "./services/songbooksUpdate";
import { songsCreate } from "./services/songsCreate";
import { songsDelete } from "./services/songsDelete";
import { songsFork } from "./services/songsFork";
import { songsImport } from "./services/songsImport";
import { songsList } from "./services/songsList";
import { songsRead } from "./services/songsRead";
import { songsUpdate } from "./services/songsUpdate";
import {
	suggestionsAccept,
	suggestionsCreate,
	suggestionsList,
	suggestionsReject,
} from "./services/suggestions";

const pdfModeSchema = t.Union([
	t.Literal("fingered"),
	t.Literal("concert"),
	t.Literal("both"),
]);

const pdfExportSchema = t.Object({
	id: t.String(),
	songbookId: t.String(),
	mode: t.String(),
	status: t.Union([
		t.Literal("pending"),
		t.Literal("running"),
		t.Literal("done"),
		t.Literal("failed"),
	]),
	error: t.Nullable(t.String()),
	filename: t.Nullable(t.String()),
	bytes: t.Nullable(t.Integer()),
	songCount: t.Nullable(t.Integer()),
	createdAt: t.String(),
	finishedAt: t.Nullable(t.String()),
});

const creditSchema = t.Object({
	artist: t.Object({ name: t.String() }),
	role: t.Enum(CreditRole),
});

export const api = new Elysia({ prefix: "/api" })
	.use(serverTiming())
	.use(authMiddleware)
	// Map domain errors to HTTP status codes. We only set the status (no JSON body):
	// returning a body here would widen every route's success type with the error
	// shape in the Eden-derived client types. The status still reaches the client via
	// the Eden `error` channel; the human-readable reason is logged server-side.
	.onError(({ error, set }) => {
		if (error instanceof HttpError) {
			set.status = error.status;
			return;
		}
		// Prisma "not found" (find*OrThrow) → 404
		if (
			error instanceof Error &&
			error.name === "PrismaClientKnownRequestError"
		) {
			set.status = 404;
			return;
		}
	})
	// Readiness probe for the platform (railway.json `healthcheckPath`). It touches the
	// database on purpose: the container start now runs `prisma migrate deploy` and the
	// SQLite file lives on a mounted volume, so "the process is listening" is not the
	// same as "this deploy can serve". A boot that can't read /data should fail the
	// deploy rather than take traffic. No auth — the platform has no session.
	//
	// Note this is a *deploy-time* gate only: Railway does not poll it afterwards, so it
	// cannot restart a container that wedges later.
	.get(
		"/health",
		async () => {
			await prisma.$queryRaw`SELECT 1`;
			return { ok: true };
		},
		{ response: t.Object({ ok: t.Boolean() }) },
	)
	.group("/songs", (group) =>
		group
			.get("/", ({ user, query }) => songsList({ user, query }), {
				auth: true,
				query: t.Object({
					scope: t.Optional(t.String()),
					q: t.Optional(t.String()),
					artist: t.Optional(t.String()),
					key: t.Optional(t.String()),
					tag: t.Optional(t.String()),
				}),
			})
			.get(
				"/:slug",
				({ params, user }) => songsRead({ slug: params.slug, user }),
				{
					auth: true,
				},
			)
			.post(
				"/",
				({ user, body }) => songsCreate({ userId: user.id, payload: body }),
				{
					auth: true,
					body: t.Object({
						name: t.String({ minLength: 1 }),
						year: t.Optional(
							t.Nullable(t.Integer({ minimum: 0, maximum: 2100 })),
						),
						organizationId: t.String(),
						credits: t.Optional(t.Array(creditSchema)),
						tags: t.Optional(t.Array(t.String())),
						chart: t.Object({
							content: t.String(),
							description: t.Optional(t.String()),
						}),
					}),
				},
			)
			// Import from an external chord-sheet site (akordy.kytary.cz) → a new song
			// in the chosen scope. Declared before "/:slug" routes for clarity.
			.post(
				"/import",
				({ user, body }) => songsImport({ userId: user.id, payload: body }),
				{
					auth: true,
					body: t.Object({
						url: t.String({ minLength: 1 }),
						organizationId: t.String(),
					}),
				},
			)
			.put(
				"/:slug",
				({ params, user, body }) =>
					songsUpdate({ slug: params.slug, userId: user.id, payload: body }),
				{
					auth: true,
					body: t.Object({
						name: t.Optional(t.String()),
						year: t.Optional(
							t.Nullable(t.Integer({ minimum: 0, maximum: 2100 })),
						),
						tags: t.Optional(t.Array(t.String())),
						credits: t.Optional(t.Array(creditSchema)),
						chart: t.Optional(
							t.Object({
								id: t.Optional(t.String()),
								content: t.String(),
								description: t.Optional(t.String()),
							}),
						),
					}),
				},
			)
			.delete(
				"/:slug",
				({ params, user }) =>
					songsDelete({ slug: params.slug, userId: user.id }),
				{
					auth: true,
				},
			)
			.post(
				"/:slug/fork",
				({ params, user, body }) =>
					songsFork({
						slug: params.slug,
						userId: user.id,
						targetOrganizationId: body.targetOrganizationId,
						chartId: body.chartId,
					}),
				{
					auth: true,
					body: t.Object({
						targetOrganizationId: t.String(),
						chartId: t.Optional(t.String()),
					}),
				},
			),
	)
	.group("/songbooks", (group) =>
		group
			.get(
				"/",
				({ user, query }) => songbooksList({ userId: user.id, query }),
				{
					auth: true,
					query: t.Object({ scope: t.Optional(t.String()) }),
				},
			)
			.get(
				"/:id",
				({ params, user }) => songbooksRead({ id: params.id, userId: user.id }),
				{
					auth: true,
				},
			)
			.post(
				"/",
				({ user, body }) => songbooksCreate({ userId: user.id, payload: body }),
				{
					auth: true,
					body: t.Object({
						title: t.String({ minLength: 1 }),
						description: t.Optional(t.String()),
						organizationId: t.String(),
						chartIds: t.Optional(t.Array(t.String())),
					}),
				},
			)
			.put(
				"/:id",
				({ params, user, body }) =>
					songbooksUpdate({ id: params.id, userId: user.id, payload: body }),
				{
					auth: true,
					body: t.Object({
						title: t.Optional(t.String()),
						description: t.Optional(t.String()),
						chartIds: t.Optional(t.Array(t.String())),
					}),
				},
			)
			.delete(
				"/:id",
				({ params, user }) =>
					songbooksDelete({ id: params.id, userId: user.id }),
				{
					auth: true,
				},
			)
			// Queue a render and return immediately (CLAUDE.md §D20). There is deliberately
			// no synchronous variant: a render outlives the connection it was asked on.
			.post(
				"/:id/pdf",
				({ params, user, body }) =>
					pdfExportCreate({
						songbookId: params.id,
						userId: user.id,
						mode: body?.mode,
					}),
				{
					auth: true,
					body: t.Optional(t.Object({ mode: t.Optional(pdfModeSchema) })),
					response: pdfExportSchema,
				},
			),
	)
	.group("/pdf-exports", (group) =>
		group
			.get(
				"/:jobId",
				({ params, user }) =>
					pdfExportRead({ jobId: params.jobId, userId: user.id }),
				{ auth: true, response: pdfExportSchema },
			)
			.get(
				"/:jobId/download",
				async ({ params, user }) => {
					const { path, filename } = await pdfExportFile({
						jobId: params.jobId,
						userId: user.id,
					});
					return new Response(Bun.file(path), {
						headers: {
							"content-type": "application/pdf",
							"content-disposition": `attachment; filename="${filename}"`,
						},
					});
				},
				{ auth: true },
			),
	)
	// Web push (CLAUDE.md §D21). The subscription is a device's, so these are keyed on
	// the endpoint the browser hands over, not on the session.
	.group("/push", (group) =>
		group
			// Public: it's a public key, and the client needs it before it can subscribe.
			// `null` means push isn't configured on this deployment — the signal to hide
			// the opt-in rather than offer a button that can only fail.
			.get("/key", () => pushPublicKey(), {
				response: t.Object({ publicKey: t.Nullable(t.String()) }),
			})
			.get("/status", ({ user }) => pushStatus({ userId: user.id }), {
				auth: true,
				response: t.Object({
					configured: t.Boolean(),
					publicKey: t.Nullable(t.String()),
					devices: t.Integer(),
				}),
			})
			// `/devices`, not `/subscribe`: Eden Treaty reserves `.subscribe()` on the
			// client for WebSocket routes, so that path is simply not callable from it.
			.post(
				"/devices",
				({ user, body, headers }) =>
					pushSubscribe({
						userId: user.id,
						subscription: body,
						// Only to tell devices apart in Preferences; never parsed.
						userAgent: headers["user-agent"],
					}),
				{
					auth: true,
					body: t.Object({
						endpoint: t.String(),
						keys: t.Object({ p256dh: t.String(), auth: t.String() }),
					}),
					response: t.Object({ ok: t.Boolean() }),
				},
			)
			.delete(
				"/devices",
				({ user, body }) =>
					pushUnsubscribe({ userId: user.id, endpoint: body.endpoint }),
				{
					auth: true,
					body: t.Object({ endpoint: t.String() }),
					response: t.Object({ ok: t.Boolean() }),
				},
			)
			// Every link in the chain — VAPID identity, the push service, the worker's
			// handler, the OS — fails independently and silently. One button that either
			// buzzes or doesn't says more than any amount of status text.
			.post("/test", ({ user }) => pushTest({ userId: user.id }), {
				auth: true,
				response: t.Object({ sent: t.Integer() }),
			}),
	)
	.group("/live", (group) =>
		group
			// Public, no-auth read — fans poll this to follow the band. `clientId` (a random
			// per-device id) feeds the in-memory "watching" count; it's optional.
			.get(
				"/:code",
				({ params, query }) =>
					liveSessionPublicRead({
						code: params.code,
						clientId: query.clientId,
					}),
				{
					query: t.Object({ clientId: t.Optional(t.String()) }),
				},
			)
			// Band creates (or reuses) the share session for a setlist.
			.post(
				"/",
				({ user, body }) =>
					liveSessionCreate({ userId: user.id, songbookId: body.songbookId }),
				{
					auth: true,
					body: t.Object({ songbookId: t.String() }),
				},
			)
			// Band advances the set — fans follow on their next poll.
			.post(
				"/:code/current",
				({ params, user, body }) =>
					liveSessionSetCurrent({
						userId: user.id,
						code: params.code,
						currentSongIndex: body.currentSongIndex,
					}),
				{
					auth: true,
					body: t.Object({ currentSongIndex: t.Integer({ minimum: 0 }) }),
				},
			),
	)
	.group("/bands", (group) =>
		group
			// Public, no-auth preview of an invite code — the join page names the band and
			// the role on offer before it asks anyone to sign in (CLAUDE.md §D13).
			.get("/join/:code", ({ params }) =>
				bandInvitePreview({ code: params.code }),
			)
			// Redeem: adds the caller to the band with the link's role.
			.post(
				"/join/:code",
				({ params, user }) =>
					bandInviteRedeem({ userId: user.id, code: params.code }),
				{
					auth: true,
				},
			)
			// Admin: the band's outstanding links (with joiners) + legacy email invitations.
			.get(
				"/:organizationId/invites",
				({ params, user }) =>
					bandInvitesList({
						userId: user.id,
						organizationId: params.organizationId,
					}),
				{
					auth: true,
				},
			)
			.post(
				"/:organizationId/invites",
				({ params, user, body }) =>
					bandInvitesCreate({
						userId: user.id,
						organizationId: params.organizationId,
						payload: body,
					}),
				{
					auth: true,
					body: t.Object({
						role: t.Union([
							t.Literal("admin"),
							t.Literal("writer"),
							t.Literal("reader"),
						]),
						// null = never expires / unlimited joins.
						expiresInDays: t.Optional(
							t.Nullable(t.Integer({ minimum: 1, maximum: 365 })),
						),
						maxUses: t.Optional(
							t.Nullable(t.Integer({ minimum: 1, maximum: 500 })),
						),
					}),
				},
			)
			.delete(
				"/invites/:id",
				({ params, user }) =>
					bandInviteRevoke({ userId: user.id, id: params.id }),
				{
					auth: true,
				},
			)
			.delete(
				"/email-invites/:id",
				({ params, user }) =>
					bandEmailInviteCancel({ userId: user.id, id: params.id }),
				{
					auth: true,
				},
			),
	)
	.group("/suggestions", (group) =>
		group
			.post(
				"/",
				({ user, body }) =>
					suggestionsCreate({ userId: user.id, payload: body }),
				{
					auth: true,
					body: t.Object({
						chartId: t.String(),
						proposedContent: t.String(),
						message: t.Optional(t.String()),
					}),
				},
			)
			.get(
				"/",
				({ user, query }) =>
					suggestionsList({
						userId: user.id,
						organizationId: query.organizationId,
					}),
				{
					auth: true,
					query: t.Object({ organizationId: t.String() }),
				},
			)
			.post(
				"/:id/accept",
				({ params, user }) =>
					suggestionsAccept({ id: params.id, userId: user.id }),
				{
					auth: true,
				},
			)
			.post(
				"/:id/reject",
				({ params, user }) =>
					suggestionsReject({ id: params.id, userId: user.id }),
				{
					auth: true,
				},
			),
	);

export type Api = typeof api;
