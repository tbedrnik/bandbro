import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins/organization";
import Elysia from "elysia";
import { ac, roles } from "./permissions";
import { prisma } from "./prisma";

export const auth = betterAuth({
	database: prismaAdapter(prisma, { provider: "sqlite" }),
	emailAndPassword: {
		enabled: true,
	},
	user: {
		additionalFields: {
			// Default chord view across the app (see CLAUDE.md §D2). Mirrors the
			// Prisma column User.defaultChordView.
			defaultChordView: {
				type: "string",
				required: false,
				defaultValue: "fingered",
				input: true,
			},
		},
	},
	databaseHooks: {
		user: {
			create: {
				// Every user gets a private "personal" Organization — their one-man-band
				// scope. Reuses all org/membership/fork machinery (CLAUDE.md §D1). Marked
				// with metadata {personal:true} so the UI hides it from the band switcher
				// and forbids inviting members.
				after: async (user) => {
					const slug = `personal-${user.id.slice(0, 12)}`;
					const org = await prisma.organization.create({
						data: {
							id: crypto.randomUUID(),
							name: "Personal",
							slug,
							createdAt: new Date(),
							metadata: JSON.stringify({ personal: true }),
						},
					});
					await prisma.member.create({
						data: {
							id: crypto.randomUUID(),
							organizationId: org.id,
							userId: user.id,
							role: "admin",
							createdAt: new Date(),
						},
					});
				},
			},
		},
	},
	plugins: [
		organization({
			allowUserToCreateOrganization: true,
			cancelPendingInvitationsOnReInvite: true,
			creatorRole: "admin",
			ac,
			roles,
		}),
	],
});

export type Auth = typeof auth;

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
