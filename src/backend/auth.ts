import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins/organization";
import Elysia from "elysia";
import { prisma } from "./prisma";

export const auth = betterAuth({
	database: prismaAdapter(prisma, { provider: "sqlite" }),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [
		organization({
			allowUserToCreateOrganization: true,
			cancelPendingInvitationsOnReInvite: true,
		}),
	],
});

export const authMiddleware = new Elysia({ name: "better-auth" })
	.mount(auth.handler)
	.macro({
		auth: {
			async resolve({ status, request: { headers } }) {
				const session = await auth.api.getSession({
					headers,
				});

				if (!session) return status(401);

				return {
					user: session.user,
					session: session.session,
				};
			},
		},
		authOptional: {
			async resolve({ request: { headers } }) {
				const session = await auth.api.getSession({
					headers,
				});

				return {
					user: session?.user,
					session: session?.session,
				};
			},
		},
	});
