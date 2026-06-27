import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";
import type { Auth as ServerAuth } from "@backend/auth";
import { ac, roles } from "@backend/permissions";

export const auth = createAuthClient({
	plugins: [
		organizationClient({ ac, roles }),
		inferAdditionalFields<ServerAuth>(),
	],
});

export type Auth = typeof auth.$Infer;
