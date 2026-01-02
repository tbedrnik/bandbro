import { Elysia } from "elysia";
import { addNumbers } from "../shared/addNumbers";
import { authMiddleware } from "./auth";
import {serverTiming} from "@elysiajs/server-timing";
import { prisma } from "./prisma";

const dbPath = (process.env.DATABASE_URL || "").replace('file:', '')
const dbFile = Bun.file(dbPath)

export const api = new Elysia({prefix: '/api'})
.use(serverTiming())
.use(authMiddleware)
.get('/add', () => addNumbers(1, 2))
.get('/db/get', () => dbFile)
.get('/db/meta', () => dbFile.exists().then((aha) => `db file "${dbPath}" exists: ${aha}`))
.get('/db/info', async () => {
	const results = await Promise.allSettled([
		prisma.account.count(),
		prisma.session.count(),
		prisma.user.count(),
		prisma.verification.count(),
		prisma.song.count(),
	])

	return results.map((result) => result.status === 'fulfilled' ? result.value : result.reason)
})
.get('/file', () => Bun.file(new URL(import.meta.url)))

export type Api = typeof api;