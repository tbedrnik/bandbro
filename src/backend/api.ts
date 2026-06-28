import { serverTiming } from "@elysiajs/server-timing";
import { Elysia, t } from "elysia";
import { CreditRole } from "../generated/prisma/enums";
import { authMiddleware } from "./auth";
import { HttpError } from "./services/scope";
import { songbooksCreate } from "./services/songbooksCreate";
import { songbooksDelete } from "./services/songbooksDelete";
import { songbooksList } from "./services/songbooksList";
import { songbooksPdf } from "./services/songbooksPdf";
import { songbooksRead } from "./services/songbooksRead";
import { songbooksUpdate } from "./services/songbooksUpdate";
import { songsCreate } from "./services/songsCreate";
import { songsDelete } from "./services/songsDelete";
import { songsFork } from "./services/songsFork";
import { songsList } from "./services/songsList";
import { songsRead } from "./services/songsRead";
import { songsUpdate } from "./services/songsUpdate";
import {
	suggestionsAccept,
	suggestionsCreate,
	suggestionsList,
	suggestionsReject,
} from "./services/suggestions";

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
			.get(
				"/:id/pdf",
				async ({ params, user, query, set }) => {
					const { pdf, filename } = await songbooksPdf({
						id: params.id,
						userId: user.id,
						mode: query.mode,
					});
					set.headers["content-type"] = "application/pdf";
					set.headers["content-disposition"] =
						`attachment; filename="${filename}"`;
					return new Response(pdf as unknown as BlobPart);
				},
				{
					auth: true,
					query: t.Object({
						mode: t.Optional(
							t.Union([
								t.Literal("fingered"),
								t.Literal("concert"),
								t.Literal("both"),
							]),
						),
					}),
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
