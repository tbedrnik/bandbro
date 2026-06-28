import { treaty } from "@elysiajs/eden";
import { createEdenOptionsProxy } from "eden-tanstack-react-query";
import type { Api } from "../backend/api";

const client = treaty<Api>(location.origin);

// `api` is the `/api` subtree of the options proxy — call sites use `api.songs`,
// `api.songbooks`, `api.suggestions`.
export const { api } = createEdenOptionsProxy<Api>({ client });
