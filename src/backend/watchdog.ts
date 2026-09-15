/**
 * The last line of defence against a container that is alive but wedged (CLAUDE.md §D27).
 *
 * §D17 established the gap: Railway calls `healthcheckPath` only at *deploy* time, and
 * `restartPolicyType: ON_FAILURE` only reacts to the process actually exiting. Between
 * them, nothing on the platform can recover a process that is still listening but can no
 * longer serve — which is exactly the "it froze and needed a rebuild" symptom. So the
 * process has to notice on its own and exit, and let the restart policy do its job.
 *
 * Two details that decide whether this works or makes things worse:
 *
 * - **A hung check is a failure, not a wait.** The failure being watched for is a wedge,
 *   and a wedged database read does not reject — it never settles. Without `timeoutMs`
 *   the watchdog would hang alongside the thing it is watching.
 * - **It takes several consecutive failures.** One slow query under a PDF render (§D17's
 *   `chordpro` subprocess saturates both cores) must not restart a server mid-gig. The
 *   counter resets on any success, so only a sustained outage trips it.
 */

export type Watchdog = {
	/** Run one check. Exported so tests can drive it without waiting on timers. */
	tick: () => Promise<void>;
	/** Consecutive failures so far; zero after any success. */
	readonly failures: number;
};

export type WatchdogOptions = {
	/** The liveness probe. Anything that throws — or hangs — counts as a failure. */
	check: () => Promise<unknown>;
	/** Called once, when the failure run reaches `failuresBeforeDead`. */
	onDead: (failures: number, lastError: unknown) => void;
	/** Consecutive failures tolerated before `onDead`. */
	failuresBeforeDead?: number;
	/** A check that hasn't settled in this long is counted as failed. */
	timeoutMs?: number;
};

class CheckTimeout extends Error {
	constructor(ms: number) {
		super(`liveness check did not answer within ${ms}ms`);
	}
}

export function createWatchdog({
	check,
	onDead,
	failuresBeforeDead = 5,
	timeoutMs = 10_000,
}: WatchdogOptions): Watchdog {
	let failures = 0;
	let dead = false;

	return {
		get failures() {
			return failures;
		},
		async tick() {
			if (dead) return;
			try {
				let timer: ReturnType<typeof setTimeout> | undefined;
				await Promise.race([
					check(),
					new Promise((_resolve, reject) => {
						timer = setTimeout(
							() => reject(new CheckTimeout(timeoutMs)),
							timeoutMs,
						);
					}),
				]).finally(() => clearTimeout(timer));
				failures = 0;
			} catch (error) {
				failures++;
				if (failures >= failuresBeforeDead) {
					dead = true; // report once; the process is on its way out
					onDead(failures, error);
				}
			}
		},
	};
}

/**
 * Run a watchdog on an interval. The timer is unref'd so it never keeps the process
 * alive on its own — the server does that, and a server that has stopped listening
 * needs no watchdog.
 */
export function startWatchdog(
	options: WatchdogOptions & { intervalMs?: number },
): Watchdog {
	const { intervalMs = 30_000, ...rest } = options;
	const watchdog = createWatchdog(rest);
	const timer = setInterval(() => {
		void watchdog.tick();
	}, intervalMs);
	timer.unref?.();
	return watchdog;
}
