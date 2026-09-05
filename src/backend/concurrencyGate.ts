/**
 * A bounded queue in front of expensive work.
 *
 * The setlist PDF (CLAUDE.md §D8) shells out to `chordpro`, which is single-threaded,
 * CPU-bound, and tens of seconds long on the 2-vCPU container this deploys to. Left
 * unbounded, a handful of retries — the user clicking Export again, plus the platform's
 * edge proxy retrying a dropped upstream connection — put several Perl processes on the
 * box at once, starve Bun's event loop, and make every request look hung. So: run at most
 * `maxConcurrent`, let `maxQueued` more wait, and refuse the rest immediately rather than
 * accepting work the box can't do.
 */

/** Thrown by `run` when both the running slots and the queue are full. */
export class QueueFullError extends Error {
	constructor(message = "Too much work is already in progress.") {
		super(message);
		this.name = "QueueFullError";
	}
}

export type ConcurrencyGate = {
	run<T>(fn: () => Promise<T>): Promise<T>;
	/** Number of tasks currently running. Exposed for tests and logging. */
	readonly active: number;
	/** Number of tasks waiting for a slot. */
	readonly queued: number;
};

export function createConcurrencyGate({
	maxConcurrent,
	maxQueued,
}: {
	maxConcurrent: number;
	maxQueued: number;
}): ConcurrencyGate {
	let active = 0;
	let queued = 0;
	const waiting: Array<() => void> = [];

	async function acquire(): Promise<void> {
		if (active < maxConcurrent) {
			active++;
			return;
		}
		if (queued >= maxQueued) throw new QueueFullError();
		queued++;
		try {
			await new Promise<void>((resolve) => waiting.push(resolve));
		} finally {
			queued--;
		}
		// `release` handed its slot straight over, so `active` is already ours.
	}

	function release(): void {
		const next = waiting.shift();
		// Handing the slot to the next waiter rather than decrementing and letting it
		// re-check is what keeps `active` at or below the cap: if we decremented here, a
		// request arriving before the woken waiter resumed would see a free slot and take
		// it, and both would then run.
		if (next) next();
		else active--;
	}

	return {
		get active() {
			return active;
		},
		get queued() {
			return queued;
		},
		async run<T>(fn: () => Promise<T>): Promise<T> {
			await acquire();
			try {
				return await fn();
			} finally {
				release();
			}
		},
	};
}
