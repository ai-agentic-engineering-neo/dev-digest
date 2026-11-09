import { describe, it, expect } from "vitest";
import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import { newestFinishedReview, toBriefVerdict } from "./helpers";

const review = (id: string, run_id: string | null, created_at: string, over: Partial<ReviewRecord> = {}): ReviewRecord => ({
  id,
  pr_id: "pr",
  agent_id: null,
  run_id,
  agent_name: "Security",
  kind: "review",
  verdict: "approve",
  summary: null,
  score: 80,
  model: null,
  created_at,
  findings: [],
  ...over,
});

const run = (run_id: string, status: string): RunSummary => ({
  run_id,
  agent_id: null,
  agent_name: null,
  provider: null,
  model: null,
  status,
  error: null,
  duration_ms: null,
  tokens_in: null,
  tokens_out: null,
  cost_usd: null,
  findings_count: null,
  grounding: null,
  ran_at: null,
  score: null,
  blockers: null,
});

describe("newestFinishedReview", () => {
  it("skips reviews whose run is not done and picks the newest finished one", () => {
    const r3 = review("R3", "run3", "2026-11-09T12:00:00Z");
    const r2 = review("R2", "run2", "2026-11-09T11:00:00Z");
    const r1 = review("R1", "run1", "2026-11-09T10:00:00Z");
    const runs = [run("run3", "running"), run("run2", "failed"), run("run1", "done")];
    expect(newestFinishedReview([r3, r2, r1], runs)?.id).toBe("R1");

    const noRun = review("R2", null, "2026-11-09T11:00:00Z");
    expect(newestFinishedReview([noRun, r1], runs)?.id).toBe("R2");

    expect(newestFinishedReview([r3, r1], [run("run3", "cancelled")])).toBeNull();
    expect(newestFinishedReview([review("R", null, "2026-11-09T10:00:00Z", { verdict: null })], [])).toBeNull();
  });
});

describe("toBriefVerdict", () => {
  it("maps loading, failure, no finished review and a ready review", () => {
    expect(toBriefVerdict({ reviews: undefined, runs: [], failed: false })).toEqual({ state: "none" });
    expect(toBriefVerdict({ reviews: [], runs: [], failed: true })).toEqual({ state: "error" });
    expect(toBriefVerdict({ reviews: [], runs: [], failed: false })).toEqual({ state: "none" });
    const ready = toBriefVerdict({
      reviews: [review("R1", "run1", "2026-11-09T10:00:00Z", { verdict: "request_changes", score: 61 })],
      runs: [run("run1", "done")],
      failed: false,
    });
    expect(ready).toEqual({
      state: "ready",
      verdict: "request_changes",
      score: 61,
      findings: 0,
      blockers: 0,
      agentName: "Security",
      reviewedAt: "2026-11-09T10:00:00Z",
    });
  });
});
