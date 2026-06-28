import { treaty } from "@elysiajs/eden";
import { createEdenOptionsProxy } from "eden-tanstack-react-query";
import type { Api } from "../backend/api";

const client = treaty<Api>(location.origin);

/**
 * Type of the `/api` subtree of the options proxy — what call sites use
 * (`api.songs`, `api.songbooks`, `api.suggestions`).
 */
type ApiProxy = ReturnType<typeof createEdenOptionsProxy<Api>>["api"];

/**
 * eden-tanstack-react-query's options proxy mis-navigates path params when its
 * chain includes the "/api" prefix segment — `api.songs({ slug }).get` resolved to
 * `/api/:slug/songs` instead of `/api/songs/:slug`. Building the proxy over the
 * treaty client's `/api` subtree fixes navigation for every route; the exported
 * `api` is that subtree, so call sites keep writing `api.songs`, `api.songbooks`, …
 */
export const api = createEdenOptionsProxy<Api>({
	client: (client as unknown as { api: typeof client }).api,
}) as unknown as ApiProxy;
