import { afterEach, describe, expect, test } from "bun:test";
import {
	pushConfig,
	pushPublicKey,
	pushSendToUser,
	resetPushConfig,
} from "./push";

// A throwaway pair from `bun run push:keys`. It has to be a real one — web-push
// validates the curve, so an invented string would take the "malformed" path and prove
// nothing. Published here, therefore burned: never use it for a deployment.
const PUBLIC =
	"BPTLvDAeFa6HdN866C8vAKHFLx6B43HWnauDTzL1jorV-HJnQ0nzs2jnAV0KDvjRbF4fTy7hQGYyB5_yZN70GMw";
const PRIVATE = "SvW78tDedTKdjl1eGnDL6BxiTHPUcBpIX3wI5b5KTwk";

function setEnv(env: Record<string, string | undefined>) {
	for (const [key, value] of Object.entries(env)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	resetPushConfig();
}

afterEach(() => {
	setEnv({
		VAPID_PUBLIC_KEY: undefined,
		VAPID_PRIVATE_KEY: undefined,
		VAPID_SUBJECT: undefined,
	});
});

describe("pushConfig", () => {
	test("a full set of keys configures push", () => {
		setEnv({
			VAPID_PUBLIC_KEY: PUBLIC,
			VAPID_PRIVATE_KEY: PRIVATE,
			VAPID_SUBJECT: "mailto:band@example.com",
		});
		expect(pushConfig()?.publicKey).toBe(PUBLIC);
		expect(pushPublicKey()).toEqual({ publicKey: PUBLIC });
	});

	// A fresh clone, a preview deploy and every local dev box start here. Push has to be
	// absent rather than broken: nothing else in the app may depend on it.
	test("no keys is a supported state, not an error", () => {
		setEnv({
			VAPID_PUBLIC_KEY: undefined,
			VAPID_PRIVATE_KEY: undefined,
			VAPID_SUBJECT: undefined,
		});
		expect(pushConfig()).toBeNull();
		expect(pushPublicKey()).toEqual({ publicKey: null });
	});

	test("a partial set is treated as absent, not as half-configured", () => {
		for (const missing of [
			"VAPID_PUBLIC_KEY",
			"VAPID_PRIVATE_KEY",
			"VAPID_SUBJECT",
		]) {
			setEnv({
				VAPID_PUBLIC_KEY: PUBLIC,
				VAPID_PRIVATE_KEY: PRIVATE,
				VAPID_SUBJECT: "mailto:band@example.com",
				[missing]: undefined,
			});
			expect(pushConfig()).toBeNull();
		}
	});

	// web-push validates the key pair up front. That must disable push, not throw out of
	// whatever request happened to touch it first.
	test("malformed keys disable push instead of throwing", () => {
		setEnv({
			VAPID_PUBLIC_KEY: "not-a-key",
			VAPID_PRIVATE_KEY: "also-not-a-key",
			VAPID_SUBJECT: "mailto:band@example.com",
		});
		expect(pushConfig()).toBeNull();
	});

	test("a subject that isn't a contactable URL is rejected", () => {
		setEnv({
			VAPID_PUBLIC_KEY: PUBLIC,
			VAPID_PRIVATE_KEY: PRIVATE,
			VAPID_SUBJECT: "The Wildcards",
		});
		expect(pushConfig()).toBeNull();
	});
});

describe("pushSendToUser", () => {
	// Sending is a side channel on work that has already succeeded. With push off it must
	// answer quietly — and without touching the database, which is what makes this
	// testable at all.
	test("is a no-op when push isn't configured", async () => {
		setEnv({
			VAPID_PUBLIC_KEY: undefined,
			VAPID_PRIVATE_KEY: undefined,
			VAPID_SUBJECT: undefined,
		});
		expect(
			await pushSendToUser({
				userId: "u1",
				payload: { title: "t", body: "b", tag: "x", url: "/app/" },
			}),
		).toEqual({ sent: 0, pruned: 0 });
	});
});
