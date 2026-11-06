import { describe, expect, it } from "vitest";
import type { Agent, FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import {
  aggregateEstimate,
  agentColorIndex,
  buildColumns,
  defaultSelection,
  formatSeconds,
  latestRunPerAgent,
  runTotals,
  scoreTone,
  sortFindings,
  toSelectedAgents,
  visibleFindings,
} from "./helpers";
import type { AgentColumnView, SelectedAgent } from "./types";

function agent(id: string, enabled = true): Agent {
  return { id, name: `Agent ${id}`, model: "m", enabled } as Agent;
}

function run(over: Partial<RunSummary> & { run_id: string }): RunSummary {
  return {
    agent_id: "a",
    agent_name: null,
    provider: null,
    model: null,
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: null,
    tokens_out: null,
    cost_usd: null,
    findings_count: null,
    grounding: null,
    ran_at: "2026-01-01T00:00:00Z",
    score: null,
    blockers: null,
    ...over,
  };
}

function finding(over: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "",
    confidence: 0.5,
    review_id: "r",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  } as FindingRecord;
}

function review(runId: string, findings: FindingRecord[] = []): ReviewRecord {
  return {
    id: `rev-${runId}`,
    pr_id: "pr",
    agent_id: "a",
    run_id: runId,
    kind: "review",
    verdict: null,
    summary: null,
    score: 80,
    model: null,
    created_at: "2026-01-01T00:00:00Z",
    findings,
  } as ReviewRecord;
}

const SEL: SelectedAgent = { id: "a", name: "A", model: "m", colorIndex: 1 };

describe("agent selection and colors", () => {
  it("gives stable, unique colors regardless of list order, and builds the selection", () => {
    const ids = ["d", "b", "a", "c"];
    const shuffled = ["a", "c", "d", "b"];
    for (const id of ids) expect(agentColorIndex(id, ids)).toBe(agentColorIndex(id, shuffled));
    expect(new Set(ids.map((id) => agentColorIndex(id, ids))).size).toBe(4);
    expect(agentColorIndex("zzz", ids)).toBe(1);
    const many = Array.from({ length: 7 }, (_, i) => `id${i}`);
    expect(agentColorIndex("id6", many)).toBe(1);

    const agents = [agent("a"), agent("b", false), agent("c")];
    expect(defaultSelection(agents)).toEqual(["a", "c"]);
    expect(toSelectedAgents(agents, null).map((x) => x.id)).toEqual(["a", "c"]);
    expect(toSelectedAgents(agents, ["c", "nope", "b"]).map((x) => x.id)).toEqual(["b", "c"]);

    const twelve = Array.from({ length: 12 }, (_, i) => agent(`x${String(i).padStart(2, "0")}`));
    expect(toSelectedAgents(twelve, null)).toHaveLength(10);
    expect(toSelectedAgents(twelve, twelve.map((x) => x.id))).toHaveLength(10);
  });
});

describe("latestRunPerAgent and sortFindings", () => {
  it("picks the newest run regardless of order and ignores null agents", () => {
    const older = run({ run_id: "old", ran_at: "2026-01-01T00:00:00Z" });
    const newer = run({ run_id: "new", ran_at: "2026-02-01T00:00:00Z" });
    const noDate = run({ run_id: "nd", ran_at: null });
    expect(latestRunPerAgent([older, newer]).get("a")?.run_id).toBe("new");
    expect(latestRunPerAgent([newer, older]).get("a")?.run_id).toBe("new");
    expect(latestRunPerAgent([noDate, older]).get("a")?.run_id).toBe("old");
    expect(latestRunPerAgent([run({ run_id: "x", agent_id: null })]).size).toBe(0);
  });

  it("sorts by severity desc, file asc, line asc", () => {
    const sorted = sortFindings([
      finding({ id: "1", severity: "SUGGESTION" }),
      finding({ id: "2", severity: "CRITICAL", file: "b.ts", start_line: 5 }),
      finding({ id: "3", severity: "CRITICAL", file: "a.ts", start_line: 9 }),
      finding({ id: "4", severity: "CRITICAL", file: "a.ts", start_line: 2 }),
    ]);
    expect(sorted.map((f) => f.id)).toEqual(["4", "3", "2", "1"]);
  });
});

describe("buildColumns", () => {
  it("maps every start-state and run-status branch", () => {
    const f = finding({ id: "f1" });
    const done = run({ run_id: "r-done" });
    const stateOf = (
      runs: RunSummary[],
      reviews: ReviewRecord[],
      start: Parameters<typeof buildColumns>[3],
    ) => buildColumns([SEL], runs, reviews, start)[0]!;

    expect(stateOf([], [], { a: { status: "pending" } }).state.kind).toBe("starting");
    expect(stateOf([done], [], { a: { status: "failed", error: "429" } }).state).toEqual({
      kind: "failed_to_start",
      error: "429",
    });
    expect(stateOf([done], [], { a: { status: "started", run_id: "missing" } }).state.kind).toBe("starting");
    expect(stateOf([done, run({ run_id: "other", status: "failed" })], [review("r-done")], {
      a: { status: "started", run_id: "r-done" },
    }).state.kind).toBe("done");
    expect(stateOf([], [], {}).state.kind).toBe("starting");
    expect(stateOf([run({ run_id: "r", status: "running" })], [], {}).state.kind).toBe("running");
    expect(stateOf([run({ run_id: "r", status: null })], [], {}).state.kind).toBe("running");
    expect(stateOf([run({ run_id: "r", status: "weird" })], [], {}).state.kind).toBe("running");
    expect(stateOf([run({ run_id: "r", status: "failed" })], [], {}).state.kind).toBe("failed");
    expect(stateOf([run({ run_id: "r", status: "cancelled" })], [], {}).state.kind).toBe("cancelled");
    // done run whose review is not cached yet, or belongs to another run
    expect(stateOf([done], [], {}).state.kind).toBe("running");
    expect(stateOf([done], [review("other")], {}).state.kind).toBe("running");

    const column = stateOf([done], [review("r-done", [f])], {});
    expect(column.state.kind).toBe("done");
    expect(column.findings.map((x) => x.id)).toEqual(["f1"]);
    expect(stateOf([run({ run_id: "r", status: "failed" })], [], {}).findings).toEqual([]);
  });
});

describe("runTotals, aggregateEstimate, formatting", () => {
  it("computes wall time and cost totals", () => {
    const col = (state: AgentColumnView["state"]): AgentColumnView => ({ agent: SEL, state, findings: [] });
    const a = run({ run_id: "1", duration_ms: 3000, cost_usd: 0.1 });
    const b = run({ run_id: "2", status: "failed", duration_ms: 9000, cost_usd: 0.05 });
    const c = run({ run_id: "3", status: "running", duration_ms: 99999, cost_usd: null });
    const totals = runTotals([
      col({ kind: "done", run: a, review: review("1") }),
      col({ kind: "failed", run: b }),
      col({ kind: "running", run: c }),
      col({ kind: "starting" }),
    ]);
    expect(totals.agent_count).toBe(4);
    expect(totals.wall_ms).toBe(9000);
    expect(totals.cost_usd).toBeCloseTo(0.15);

    const nulls = runTotals([col({ kind: "running", run: c }), col({ kind: "starting" })]);
    expect(nulls.wall_ms).toBeNull();
    expect(nulls.cost_usd).toBeNull();
    expect(runTotals([col({ kind: "failed", run: run({ run_id: "4", cost_usd: null }) })]).cost_usd).toBeNull();
  });

  it("aggregates estimates for selected agents only", () => {
    const estimates = [
      { agent_id: "a", sample_size: 3, avg_duration_ms: 4000, avg_cost_usd: 0.1 },
      { agent_id: "b", sample_size: 1, avg_duration_ms: 9000, avg_cost_usd: null },
      { agent_id: "c", sample_size: 2, avg_duration_ms: 20000, avg_cost_usd: 1 },
    ];
    expect(aggregateEstimate(["a", "b", "x"], estimates)).toEqual({ duration_ms: 9000, cost_usd: 0.1 });
    expect(aggregateEstimate(["b"], estimates)).toEqual({ duration_ms: 9000, cost_usd: null });
    expect(aggregateEstimate(["x"], estimates)).toBeNull();
    expect(aggregateEstimate([], estimates)).toBeNull();
  });

  it("formats seconds and score tones at the boundaries", () => {
    expect(formatSeconds(8240)).toBe("8.2");
    expect(scoreTone(75)).toBe("ok");
    expect(scoreTone(74)).toBe("warn");
    expect(scoreTone(50)).toBe("warn");
    expect(scoreTone(49)).toBe("crit");
  });
});

describe("visibleFindings", () => {
  it("returns every finding without a filter and only conflict findings with one", () => {
    const column: AgentColumnView = {
      agent: SEL,
      state: { kind: "starting" },
      findings: [finding({ id: "f1" }), finding({ id: "f2" })],
    };
    expect(visibleFindings(column, null).map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(visibleFindings(column, new Set(["f2"])).map((f) => f.id)).toEqual(["f2"]);
    expect(visibleFindings(column, new Set())).toEqual([]);
  });
});
