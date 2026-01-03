import {createAuthClient} from 'better-auth/client';
import {organizationClient} from 'better-auth/client/plugins';

export const auth = createAuthClient({plugins: [organizationClient()]})

export type Auth = typeof auth.$Infer