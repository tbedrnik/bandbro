import { serverTiming } from "@elysiajs/server-timing";
import { Elysia, t } from "elysia";
import { CreditRole } from "../generated/prisma/enums";
import { addNumbers } from "../shared/addNumbers";
import { authMiddleware } from "./auth";
import { songbooksCreate } from "./services/songbooksCreate";
import { songbooksDelete } from "./services/songbooksDelete";
import { songbooksList } from "./services/songbooksList";
import { songbooksRead } from "./services/songbooksRead";
import { songbooksUpdate } from "./services/songbooksUpdate";
import { songsCreate } from "./services/songsCreate";
import { songsDelete } from "./services/songsDelete";
import { songsList } from "./services/songsList";
import { songsRead } from "./services/songsRead";
import { songsUpdate } from "./services/songsUpdate";

export const api = new Elysia({ prefix: "/api" })
	.use(serverTiming())
	.use(authMiddleware)
	.get("/add", () => addNumbers(1, 2))
	.group("/songs", (group) =>
		group
			.get("/", ({ user }) => songsList({ user }), {
				auth: true,
				response: t.Array(
					t.Object({
						id: t.String(),
						organization: t.Nullable(
							t.Object({
								name: t.String(),
							}),
						),
						name: t.String(),
						slug: t.String(),
						credits: t.Array(
							t.Object({
								artist: t.Object({
									id: t.String(),
									name: t.String(),
									slug: t.String(),
								}),
								role: t.String(),
							}),
						),
					}),
				),
			})
			.get(
				"/:slug",
				({ params, user }) => songsRead({ slug: params.slug, user }),
				{
					auth: true,
					response: t.Object({
						id: t.String(),
						organization: t.Nullable(
							t.Object({
								name: t.String(),
							}),
						),
						name: t.String(),
						slug: t.String(),
						charts: t.Array(
							t.Object({
								id: t.String(),
								organization: t.Nullable(
									t.Object({
										name: t.String(),
									}),
								),
								content: t.String(),
							}),
						),
						credits: t.Array(
							t.Object({
								artist: t.Object({
									id: t.String(),
									name: t.String(),
									slug: t.String(),
								}),
								role: t.String(),
							}),
						),
					}),
				},
			)
			.post(
				"/",
				({ session, body }) =>
					songsCreate({
						organizationId: session.activeOrganizationId ?? null,
						payload: body,
					}),
				{
					auth: true,
					body: t.Object({
						name: t.String(),
						year: t.Integer({ minimum: 0, maximum: 2100 }),
						credits: t.Array(
							t.Object({
								artist: t.Object({ name: t.String() }),
								role: t.Enum(CreditRole),
							}),
						),
						chart: t.Object({ content: t.String() }),
					}),
				},
			)
			.put("/:slug", songsUpdate, { auth: true })
			.delete("/:slug", songsDelete, { auth: true }),
	)
	.group("/songbooks", (group) =>
		group
			.get("/", songbooksList, { auth: true })
			.get("/:id", songbooksRead, { auth: true })
			.post("/", songbooksCreate, { auth: true })
			.put("/:id", songbooksUpdate, { auth: true })
			.delete("/:id", songbooksDelete, { auth: true }),
	);

export type Api = typeof api;
