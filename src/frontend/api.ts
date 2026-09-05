import { treaty } from "@elysiajs/eden";
import { createEdenOptionsProxy } from "eden-tanstack-react-query";
import type { Api } from "../backend/api";

const client = treaty<Api>(location.origin);

// The plain Eden client, for the handful of calls that aren't a query or a mutation
// bound to a component — subscribing this device to push, say, which happens inside an
// event handler and has no cache entry. Everything React-shaped should use `api` below.
export { client as apiClient };

// `api` is the `/api` subtree of the options proxy — call sites use `api.songs`,
// `api.songbooks`, `api.suggestions`.
export const { api } = createEdenOptionsProxy<Api>({ client });
