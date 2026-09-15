import { describe, expect, test } from "bun:test";
import { createWatchdog } from "./watchdog";

const never = () => new Promise<void>(() => {});

describe("createWatchdog", () => {
	test("a single blip is not a death", async () => {
		let dead = 0;
		const failing = { yes: true };
		const watchdog = createWatchdog({
			check: async () => {
				if (failing.yes) throw new Error("nope");
			},
			onDead: () => {
				dead++;
			},
			failuresBeforeDead: 3,
		});

		await watchdog.tick();
		expect(watchdog.failures).toBe(1);
		failing.yes = false;
		await watchdog.tick();
		// A success resets the run, so an intermittent failure never accumulates.
		expect(watchdog.failures).toBe(0);
		expect(dead).toBe(0);
	});

	test("a sustained outage exits after the configured run", async () => {
		const seen: number[] = [];
		const watchdog = createWatchdog({
			check: async () => {
				throw new Error("db is gone");
			},
			onDead: (failures) => seen.push(failures),
			failuresBeforeDead: 3,
		});

		await watchdog.tick();
		await watchdog.tick();
		expect(seen).toEqual([]);
		await watchdog.tick();
		expect(seen).toEqual([3]);
	});

	test("reports once, however long it keeps failing", async () => {
		let dead = 0;
		const watchdog = createWatchdog({
			check: async () => {
				throw new Error("still gone");
			},
			onDead: () => {
				dead++;
			},
			failuresBeforeDead: 1,
		});
		await watchdog.tick();
		await watchdog.tick();
		await watchdog.tick();
		expect(dead).toBe(1);
	});

	test("a check that never answers counts as failed", async () => {
		// The whole point: a wedged process doesn't reject, it hangs. Without the
		// timeout the watchdog would hang with it and never fire.
		let lastError: unknown;
		const watchdog = createWatchdog({
			check: never,
			onDead: (_failures, error) => {
				lastError = error;
			},
			failuresBeforeDead: 1,
			timeoutMs: 5,
		});
		await watchdog.tick();
		expect(watchdog.failures).toBe(1);
		expect(String(lastError)).toContain("did not answer");
	});
});
