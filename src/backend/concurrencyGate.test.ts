import { describe, expect, test } from "bun:test";
import { createConcurrencyGate, QueueFullError } from "./concurrencyGate";

/** A task that resolves only when told to, so a test can hold slots open. */
function deferred() {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("createConcurrencyGate", () => {
	test("runs up to maxConcurrent tasks at once and queues the rest", async () => {
		const gate = createConcurrencyGate({ maxConcurrent: 1, maxQueued: 3 });
		const first = deferred();
		const second = deferred();

		const a = gate.run(() => first.promise);
		await Promise.resolve();
		expect(gate.active).toBe(1);

		const b = gate.run(() => second.promise);
		await Promise.resolve();
		// b is waiting, not running — the gate is the whole point.
		expect(gate.active).toBe(1);
		expect(gate.queued).toBe(1);

		first.resolve();
		await a;
		await Promise.resolve();
		expect(gate.queued).toBe(0);

		second.resolve();
		await b;
		expect(gate.active).toBe(0);
	});

	test("never exceeds maxConcurrent, even under a burst", async () => {
		const gate = createConcurrencyGate({ maxConcurrent: 2, maxQueued: 10 });
		let running = 0;
		let peak = 0;
		await Promise.all(
			Array.from({ length: 12 }, () =>
				gate.run(async () => {
					running++;
					peak = Math.max(peak, running);
					await Bun.sleep(1);
					running--;
				}),
			),
		);
		expect(peak).toBe(2);
		expect(gate.active).toBe(0);
		expect(gate.queued).toBe(0);
	});

	test("a request arriving while a waiter is queued cannot jump the slot", async () => {
		const gate = createConcurrencyGate({ maxConcurrent: 1, maxQueued: 5 });
		const order: string[] = [];
		const held = deferred();

		const first = gate.run(async () => {
			order.push("first");
			await held.promise;
		});
		await Promise.resolve();

		const second = gate.run(async () => {
			order.push("second");
		});
		await Promise.resolve();
		// Arrives after `second` is already waiting, so it must go behind it.
		const third = gate.run(async () => {
			order.push("third");
		});

		held.resolve();
		await Promise.all([first, second, third]);
		expect(order).toEqual(["first", "second", "third"]);
	});

	test("rejects with QueueFullError once the queue is full", async () => {
		const gate = createConcurrencyGate({ maxConcurrent: 1, maxQueued: 1 });
		const held = deferred();
		const running = gate.run(() => held.promise);
		const waiting = gate.run(async () => {});
		await Promise.resolve();

		expect(gate.run(async () => {})).rejects.toBeInstanceOf(QueueFullError);

		held.resolve();
		await Promise.all([running, waiting]);
	});

	test("a task that throws still frees its slot", async () => {
		const gate = createConcurrencyGate({ maxConcurrent: 1, maxQueued: 1 });
		expect(
			gate.run(async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		await Bun.sleep(1);
		expect(gate.active).toBe(0);

		// The gate is reusable afterwards — a failed render must not leak the slot.
		await expect(gate.run(async () => "ok")).resolves.toBe("ok");
	});
});
