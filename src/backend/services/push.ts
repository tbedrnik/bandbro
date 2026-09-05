import { prisma } from "@backend/prisma";
import { type PushPayload, testPush } from "@shared/pushPayload";
import { sendNotification, setVapidDetails, WebPushError } from "web-push";
import { HttpError } from "./scope";

/**
 * Web push (CLAUDE.md §D21) — the out-of-band channel for work that outlives the tab
 * that asked for it. Today that is exactly one thing: the setlist PDF export (§D20),
 * which renders for minutes while the browser throttles, then freezes, the page waiting
 * on it.
 *
 * Deliberately thin. There is no notification model, no read state, no preference matrix:
 * a subscription exists or it doesn't, and a message is sent once and forgotten. Push is a
 * *hint* that something finished — the job row remains the truth, and every UI path still
 * works with notifications denied, which is the common case.
 *
 * Sending is always best-effort. A push service being slow or down must never fail the
 * work being reported on, so `pushSendToUser` resolves rather than throws and the export
 * job never awaits its result.
 */

/** How long the push service should hold an undelivered message for a dark device. */
const TTL_SECONDS = 6 * 60 * 60;

/** Cap on a single send, so a hung push endpoint can't pin a request or the drain loop. */
const SEND_TIMEOUT_MS = 10_000;

export type PushConfig = {
	publicKey: string;
	privateKey: string;
	subject: string;
};

let configured: PushConfig | null | undefined;

/**
 * VAPID identity, from the environment. Absent keys are a supported state, not an error:
 * a fresh clone, a preview deploy or a local dev box has none, and everything but the
 * subscribe button has to keep working. Generate a pair with `bun run push:keys`.
 */
export function pushConfig(): PushConfig | null {
	if (configured !== undefined) return configured;

	const publicKey = process.env.VAPID_PUBLIC_KEY;
	const privateKey = process.env.VAPID_PRIVATE_KEY;
	// The RFC 8292 `sub` claim: how a push service reaches whoever runs this server if
	// its messages misbehave. Must be a mailto: or https: URL, so we can't invent one.
	const subject = process.env.VAPID_SUBJECT;

	if (!publicKey || !privateKey || !subject) {
		console.log("[push] disabled — VAPID keys not configured");
		configured = null;
		return null;
	}

	try {
		setVapidDetails(subject, publicKey, privateKey);
	} catch (error) {
		// Malformed keys: say so once, loudly, and stay disabled. Throwing here would
		// take down every request that merely asks whether push is available.
		console.error("[push] disabled — invalid VAPID configuration", error);
		configured = null;
		return null;
	}

	configured = { publicKey, privateKey, subject };
	return configured;
}

/** Reset the memoized config. Tests only. */
export function resetPushConfig(): void {
	configured = undefined;
}

/**
 * What the client needs before it can subscribe: the server's public key, or null when
 * push isn't configured — which is the signal to hide the opt-in rather than offer a
 * button that can only fail. No auth: it is a public key, and the SPA needs it early.
 */
export function pushPublicKey(): { publicKey: string | null } {
	return { publicKey: pushConfig()?.publicKey ?? null };
}

export type PushSubscriptionInput = {
	endpoint: string;
	keys: { p256dh: string; auth: string };
};

/**
 * Record (or refresh) a device's subscription.
 *
 * Keyed on the endpoint rather than on the user, because that is the identity the push
 * service issues: a browser hands back the same endpoint on every re-registration, and
 * the same *device* signed into a second account must move the row rather than duplicate
 * it — otherwise the first account keeps a live channel to a browser it no longer owns.
 */
export async function pushSubscribe({
	userId,
	subscription,
	userAgent,
}: {
	userId: string;
	subscription: PushSubscriptionInput;
	userAgent?: string;
}): Promise<{ ok: true }> {
	if (!pushConfig()) {
		throw new HttpError(501, "Push notifications are not configured.");
	}
	const { endpoint, keys } = subscription;
	if (!endpoint.startsWith("https://")) {
		throw new HttpError(400, "A push endpoint must be an https URL.");
	}
	if (!keys?.p256dh || !keys?.auth) {
		throw new HttpError(400, "The subscription is missing its keys.");
	}

	const data = {
		userId,
		p256dh: keys.p256dh,
		auth: keys.auth,
		userAgent: userAgent?.slice(0, 255) ?? null,
		lastSeenAt: new Date(),
	};
	await prisma.pushSubscription.upsert({
		where: { endpoint },
		create: { endpoint, ...data },
		update: data,
	});
	return { ok: true };
}

/** Forget a device. Scoped to the caller so one account can't unsubscribe another's. */
export async function pushUnsubscribe({
	userId,
	endpoint,
}: {
	userId: string;
	endpoint: string;
}): Promise<{ ok: true }> {
	await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
	return { ok: true };
}

/** How many devices this account would be notified on. Drives the Preferences copy. */
export async function pushStatus({ userId }: { userId: string }): Promise<{
	configured: boolean;
	publicKey: string | null;
	devices: number;
}> {
	const config = pushConfig();
	return {
		configured: Boolean(config),
		publicKey: config?.publicKey ?? null,
		devices: config
			? await prisma.pushSubscription.count({ where: { userId } })
			: 0,
	};
}

/**
 * Send to every device an account has subscribed. Best-effort by construction: it never
 * throws, and the caller is not expected to await it.
 *
 * Dead endpoints are deleted, not retried. A push service answers 404/410 for a
 * subscription the browser has discarded (permission revoked, site data cleared, the
 * endpoint rotated), and that is permanent — keeping the row would mean re-sending to it
 * forever. Any other status is transient as far as we can tell, so the row stays.
 */
export async function pushSendToUser({
	userId,
	payload,
}: {
	userId: string;
	payload: PushPayload;
}): Promise<{ sent: number; pruned: number }> {
	if (!pushConfig()) return { sent: 0, pruned: 0 };

	const subscriptions = await prisma.pushSubscription.findMany({
		where: { userId },
	});
	if (!subscriptions.length) return { sent: 0, pruned: 0 };

	const body = JSON.stringify(payload);
	const dead: string[] = [];
	let sent = 0;

	await Promise.all(
		subscriptions.map(async (subscription) => {
			try {
				await sendNotification(
					{
						endpoint: subscription.endpoint,
						keys: { p256dh: subscription.p256dh, auth: subscription.auth },
					},
					body,
					{
						TTL: TTL_SECONDS,
						timeout: SEND_TIMEOUT_MS,
						// RFC 8291. The library still defaults to the legacy `aesgcm`
						// draft encoding in its typings; be explicit rather than inherit it.
						contentEncoding: "aes128gcm",
					},
				);
				sent++;
			} catch (error) {
				const status =
					error instanceof WebPushError ? error.statusCode : undefined;
				if (status === 404 || status === 410) {
					dead.push(subscription.endpoint);
					return;
				}
				console.error("[push] send failed", {
					endpoint: subscription.endpoint.slice(0, 60),
					status,
				});
			}
		}),
	);

	if (dead.length) {
		await prisma.pushSubscription.deleteMany({
			where: { endpoint: { in: dead } },
		});
	}
	return { sent, pruned: dead.length };
}

/**
 * "Does this actually work?" — sent from Preferences right after opting in. Worth having
 * as a real endpoint: every part of the chain (VAPID identity, the push service, the
 * worker's `push` handler, the OS) can fail independently and silently, and one button
 * that either buzzes or doesn't tells you more than any amount of status text.
 */
export async function pushTest({
	userId,
}: {
	userId: string;
}): Promise<{ sent: number }> {
	if (!pushConfig()) {
		throw new HttpError(501, "Push notifications are not configured.");
	}
	const { sent } = await pushSendToUser({ userId, payload: testPush() });
	if (!sent) {
		throw new HttpError(
			404,
			"No subscribed devices — allow notifications on this device first.",
		);
	}
	return { sent };
}
