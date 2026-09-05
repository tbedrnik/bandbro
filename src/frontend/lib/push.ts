import { apiClient } from "@frontend/api";
import type { PushPayload } from "@shared/pushPayload";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

/**
 * Web push, browser side (CLAUDE.md §D21).
 *
 * The problem it solves is that a setlist PDF renders for minutes and the page can't be
 * relied on to still be watching: a backgrounded tab has its timers throttled to about
 * one a minute and is then frozen outright, and a locked phone runs nothing whatsoever.
 * Push is delivered by the OS to the service worker, so it arrives regardless.
 *
 * It is strictly an addition. Permission is denied or unavailable for most users, and
 * every flow — the export above all — works exactly as before without it. Nothing here
 * ever throws into a render path.
 */

export type PushSupport =
	/** No service worker, no PushManager, or no Notification API (older Safari, http). */
	| "unsupported"
	/** Supported, but this deployment has no VAPID keys — nothing to subscribe to. */
	| "unconfigured"
	| "available";

export type PushState = {
	support: PushSupport;
	permission: NotificationPermission;
	subscribed: boolean;
	busy: boolean;
	error: string | null;
	/**
	 * iOS delivers web push only to a PWA installed on the home screen, so on an iPhone
	 * in a browser tab the API is simply absent. Worth saying out loud, because
	 * "unsupported" there is a missing install step rather than a dead end.
	 */
	needsInstall: boolean;
};

/** Does this browser have the three APIs push needs? */
export function pushSupported(): boolean {
	return (
		typeof window !== "undefined" &&
		"serviceWorker" in navigator &&
		"PushManager" in window &&
		"Notification" in window
	);
}

/** Running as an installed PWA rather than in a browser tab. */
export function isStandalone(): boolean {
	if (typeof window === "undefined") return false;
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		// iOS predates the display-mode media query and still reports this instead.
		(navigator as { standalone?: boolean }).standalone === true
	);
}

function isIos(): boolean {
	if (typeof navigator === "undefined") return false;
	return (
		/iPad|iPhone|iPod/.test(navigator.userAgent) ||
		// iPadOS reports itself as a Mac; the touch points give it away.
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
	);
}

/**
 * VAPID public keys travel as base64url text and `subscribe()` wants raw bytes. Written
 * out rather than pulled in as a dependency — it is eight lines and the alternative is a
 * polyfill on the critical path of a permission prompt.
 */
function urlBase64ToBytes(base64Url: string): ArrayBuffer {
	const padded = base64Url.padEnd(
		base64Url.length + ((4 - (base64Url.length % 4)) % 4),
		"=",
	);
	const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
	const buffer = new ArrayBuffer(raw.length);
	const bytes = new Uint8Array(buffer);
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return buffer;
}

function sameKey(a: ArrayBuffer | null, b: ArrayBuffer): boolean {
	if (!a) return false;
	const left = new Uint8Array(a);
	const right = new Uint8Array(b);
	return (
		left.length === right.length && left.every((byte, i) => byte === right[i])
	);
}

/**
 * Subscribe this device, reusing what it already holds — unless that was issued against
 * a different VAPID key. A push service binds a subscription to the key that created it
 * and rejects a send signed by any other with 403, so a server whose keys were rotated
 * (or a device that last subscribed to a different deployment) has a subscription that
 * looks perfectly healthy and can never receive anything. Replace it rather than keep it.
 */
async function subscribeWith(
	registration: ServiceWorkerRegistration,
	key: string,
): Promise<PushSubscription> {
	const applicationServerKey = urlBase64ToBytes(key);
	const existing = await registration.pushManager.getSubscription();
	if (existing) {
		if (sameKey(existing.options.applicationServerKey, applicationServerKey)) {
			return existing;
		}
		await existing.unsubscribe();
	}
	return registration.pushManager.subscribe({
		// Required to be true by every browser: a push must produce a visible
		// notification, and the worker's handler always shows one.
		userVisibleOnly: true,
		applicationServerKey,
	});
}

/** This deployment's VAPID public key, or null when push isn't configured on it. */
async function publicKey(): Promise<string | null> {
	try {
		const { data } = await apiClient.api.push.key.get();
		return data?.publicKey ?? null;
	} catch {
		return null;
	}
}

/** The device's current subscription, if the worker is running and holds one. */
async function currentSubscription(): Promise<PushSubscription | null> {
	if (!pushSupported()) return null;
	try {
		const registration = await navigator.serviceWorker.ready;
		return await registration.pushManager.getSubscription();
	} catch {
		return null;
	}
}

/**
 * Re-register an existing subscription with the server on app start.
 *
 * Push services rotate endpoints and drop them without telling the page, and the server
 * deletes rows the moment a send comes back 404/410. Re-posting what the browser actually
 * holds is what keeps a long-lived device subscribed; the endpoint is the key, so it is an
 * upsert and costs nothing when it hasn't changed. Best-effort — offline it just fails.
 */
export async function syncPushSubscription(): Promise<void> {
	if (!pushSupported() || Notification.permission !== "granted") return;
	const subscription = await currentSubscription();
	if (!subscription) return;
	try {
		await postSubscription(subscription);
	} catch {
		// Offline, or push isn't configured server-side. The local subscription stands;
		// the next start tries again.
	}
}

async function postSubscription(subscription: PushSubscription): Promise<void> {
	const json = subscription.toJSON();
	if (!json.keys?.p256dh || !json.keys?.auth) {
		throw new Error("The browser returned a subscription with no keys.");
	}
	const { error } = await apiClient.api.push.devices.post({
		endpoint: subscription.endpoint,
		keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
	});
	if (error) throw new Error("The server rejected this subscription.");
}

/**
 * The Preferences opt-in. `enable` must be called straight from a click: browsers only
 * accept a permission prompt with a user gesture behind it, and Chrome permanently
 * blocks an origin that asks without one.
 */
export function usePushNotifications() {
	const [state, setState] = useState<PushState>(() => ({
		support: pushSupported() ? "available" : "unsupported",
		permission: pushSupported() ? Notification.permission : "denied",
		subscribed: false,
		busy: true,
		error: null,
		needsInstall: !pushSupported() && isIos() && !isStandalone(),
	}));

	// Resolve the two things only the server and the worker can answer: whether this
	// deployment has VAPID keys at all, and whether this device already holds a
	// subscription.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			if (!pushSupported()) {
				setState((s) => ({ ...s, busy: false }));
				return;
			}
			const [key, subscription] = await Promise.all([
				publicKey(),
				currentSubscription(),
			]);
			if (cancelled) return;
			setState((s) => ({
				...s,
				support: key ? "available" : "unconfigured",
				permission: Notification.permission,
				subscribed: Boolean(subscription),
				busy: false,
			}));
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const enable = useCallback(async () => {
		setState((s) => ({ ...s, busy: true, error: null }));
		try {
			// Ask first. Subscribing without permission throws anyway, and this way a
			// refusal costs nothing else.
			const permission = await Notification.requestPermission();
			if (permission !== "granted") {
				setState((s) => ({ ...s, permission, busy: false }));
				return;
			}

			const key = await publicKey();
			if (!key) throw new Error("This server has no push keys configured.");

			const registration = await navigator.serviceWorker.ready;
			await postSubscription(await subscribeWith(registration, key));
			setState((s) => ({
				...s,
				permission,
				subscribed: true,
				busy: false,
				error: null,
			}));
		} catch (error) {
			setState((s) => ({
				...s,
				busy: false,
				permission: pushSupported() ? Notification.permission : s.permission,
				error:
					error instanceof Error
						? error.message
						: "Could not turn on notifications.",
			}));
		}
	}, []);

	const disable = useCallback(async () => {
		setState((s) => ({ ...s, busy: true, error: null }));
		const subscription = await currentSubscription();
		try {
			if (subscription) {
				// Server first: if the local unsubscribe succeeds and the request then
				// fails, the row is orphaned and keeps receiving sends nobody can read.
				await apiClient.api.push.devices.delete({
					endpoint: subscription.endpoint,
				});
				await subscription.unsubscribe();
			}
			setState((s) => ({ ...s, subscribed: false, busy: false }));
		} catch {
			setState((s) => ({
				...s,
				busy: false,
				error: "Could not turn notifications off. Try again.",
			}));
		}
	}, []);

	/** Send one to this account's devices — the only honest test of the whole chain. */
	const sendTest = useCallback(async () => {
		setState((s) => ({ ...s, busy: true, error: null }));
		const { error } = await apiClient.api.push.test.post();
		setState((s) => ({
			...s,
			busy: false,
			error: error ? "The test notification could not be sent." : null,
		}));
	}, []);

	return { ...state, enable, disable, sendTest };
}

/**
 * Bridge from the service worker into the running app.
 *
 * The worker posts every push to open windows, so a foreground tab refreshes the moment
 * the notification fires instead of waiting out the rest of its polling interval; and a
 * click on a notification routes an already-open app rather than reloading it. Mounted
 * once, in the protected layout.
 */
export function usePushMessages(): void {
	const queryClient = useQueryClient();
	const router = useRouter();

	useEffect(() => {
		if (!("serviceWorker" in navigator)) return;

		const onMessage = (event: MessageEvent) => {
			const message = event.data as
				| { type: "bandbro-push"; payload: PushPayload }
				| { type: "bandbro-navigate"; url: string }
				| undefined;
			if (!message) return;

			if (message.type === "bandbro-push") {
				// Deliberately blunt: a push means server state moved under us, and the
				// alternative is teaching this bridge every query key it might affect.
				queryClient.invalidateQueries();
				return;
			}
			if (message.type === "bandbro-navigate") {
				// The worker speaks in browser paths ("/app/setlists/x?export=y"); the
				// router speaks in app paths, with the search as an object.
				const url = new URL(message.url, window.location.origin);
				router.navigate({
					to: url.pathname.replace(/^\/app/, "") || "/",
					search: Object.fromEntries(url.searchParams),
				});
			}
		};

		navigator.serviceWorker.addEventListener("message", onMessage);
		return () =>
			navigator.serviceWorker.removeEventListener("message", onMessage);
	}, [queryClient, router]);
}
