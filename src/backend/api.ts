import { Elysia } from "elysia";
import { addNumbers } from "../shared/addNumbers";
import { authMiddleware } from "./auth";
import {serverTiming} from "@elysiajs/server-timing";

export const api = new Elysia({prefix: '/api'})
.use(serverTiming())
.use(authMiddleware)
.get('/add', () => addNumbers(1, 2))
.get('/db', () => Bun.file((process.env.DATABASE_URL || "").replace('file:', '')))

export type Api = typeof api;