import {createAuthClient} from 'better-auth/client';

export const auth = createAuthClient()

export type Auth = typeof auth.$Infer