import { describe, expect, test } from "bun:test";
import { planSetlistRepair } from "./setlistScopePlan";

const chart = (
	id: string,
	organizationId: string | null,
	name = "Hallelujah",
) => ({
	id,
	organizationId,
	organization: organizationId ? { name: `Band ${organizationId}` } : null,
	song: { name },
});

const songbook = (
	id: string,
	organizationId: string,
	charts: ReturnType<typeof chart>[],
) => ({
	id,
	title: `Set ${id}`,
	organizationId,
	organization: { name: `Band ${organizationId}` },
	songs: charts.map((c, order) => ({ chartId: c.id, order, chart: c })),
});

describe("planSetlistRepair", () => {
	test("a clean setlist produces no actions", () => {
		expect(
			planSetlistRepair([
				songbook("sb1", "banda", [
					chart("c1", "banda"),
					chart("c2", null, "Curated one"),
				]),
			]),
		).toEqual([]);
	});

	test("curated charts are never touched — read-only, so they cannot drift", () => {
		const actions = planSetlistRepair([
			songbook("sb1", "banda", [chart("curated", null), chart("c2", "duo")]),
		]);
		expect(actions.map((a) => a.chartId)).toEqual(["c2"]);
	});

	test("a foreign chart is planned for a fork into the setlist's own band", () => {
		const [action] = planSetlistRepair([
			songbook("sb1", "banda", [chart("c1", "duo")]),
		]);
		expect(action).toMatchObject({
			songbookId: "sb1",
			chartId: "c1",
			organizationId: "banda",
			ownerName: "Band duo",
			reusesFork: false,
			order: 0,
		});
	});

	test("the running order is carried on the action, not recomputed", () => {
		const actions = planSetlistRepair([
			songbook("sb1", "banda", [
				chart("mine", "banda"),
				chart("theirs", "duo"),
				chart("curated", null),
			]),
		]);
		expect(actions).toHaveLength(1);
		expect(actions[0]!.order).toBe(1);
	});

	// The dedupe is the whole reason this is a global repair rather than a per-setlist one.
	test("one chart in two setlists of the same band forks ONCE", () => {
		const theirs = chart("c1", "duo");
		const actions = planSetlistRepair([
			songbook("sb1", "banda", [theirs]),
			songbook("sb2", "banda", [theirs]),
		]);
		expect(actions.map((a) => a.reusesFork)).toEqual([false, true]);
		expect(actions.map((a) => a.key)).toEqual([
			actions[0]!.key,
			actions[0]!.key,
		]);
	});

	test("the same chart borrowed by two DIFFERENT bands forks once each", () => {
		const theirs = chart("c1", "duo");
		const actions = planSetlistRepair([
			songbook("sb1", "banda", [theirs]),
			songbook("sb2", "trio", [theirs]),
		]);
		expect(actions.map((a) => a.reusesFork)).toEqual([false, false]);
		expect(actions[0]!.key).not.toBe(actions[1]!.key);
	});

	test("the same chart twice in one band's two sets still forks once", () => {
		const a = chart("c1", "duo");
		const b = chart("c2", "trio");
		const actions = planSetlistRepair([
			songbook("sb1", "banda", [a, b]),
			songbook("sb2", "banda", [b, a]),
		]);
		expect(actions.filter((x) => !x.reusesFork)).toHaveLength(2);
		expect(actions).toHaveLength(4);
	});

	test("a setlist of nothing but its own and curated charts is skipped entirely", () => {
		expect(
			planSetlistRepair([
				songbook("sb1", "banda", [chart("a", "banda"), chart("b", null)]),
				songbook("sb2", "banda", []),
			]),
		).toEqual([]);
	});
});
