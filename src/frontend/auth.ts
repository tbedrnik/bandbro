import type { Auth as ServerAuth } from "@backend/auth";
import { ac, roles } from "@backend/permissions";
import { createAuthClient } from "better-auth/client";
import {
	inferAdditionalFields,
	organizationClient,
} from "better-auth/client/plugins";

export const auth = createAuthClient({
	plugins: [
		organizationClient({ ac, roles }),
		inferAdditionalFields<ServerAuth>(),
	],
});

export type Auth = typeof auth.$Infer;
