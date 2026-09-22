import { describe, it, expect } from "vitest";
import type { PrCommit, RunSummary } from "@devdigest/shared";
import { outcomeKey, timelineItems, tsOf, usageTokens } from "./helpers";

function run(o: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "m",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

const commit = (sha: string, committed_at: string | null): PrCommit =>
  ({ sha, message: `msg ${sha}`, author: "dev", committed_at }) as PrCommit;

describe("outcomeKey", () => {
  it.each([
    [{ status: "running" }, "running"],
    [{ status: "failed", blockers: 3 }, "error"],
    [{ status: "cancelled" }, "cancelled"],
    [{ status: "done", blockers: 2, findings_count: 5 }, "rejected"],
    [{ status: "done", blockers: 0, findings_count: 3 }, "reviewed"],
    [{ status: "done", blockers: null, findings_count: null }, "approved"],
  ] as const)("%o → %s", (o, expected) => {
    expect(outcomeKey(run(o as Partial<RunSummary>))).toBe(expected);
  });
});

describe("usageTokens", () => {
  it("sums in + out for a settled run", () => {
    expect(usageTokens(run({ tokens_in: 12011, tokens_out: 980 }))).toBe(12991);
  });
  it("hides usage when nothing was recorded", () => {
    expect(usageTokens(run({ tokens_in: null, tokens_out: null }))).toBeNull();
  });
  it("shows what a failed or cancelled run spent, but not zero", () => {
    expect(usageTokens(run({ status: "failed", tokens_in: 4000, tokens_out: 200 }))).toBe(4200);
    expect(usageTokens(run({ status: "cancelled", tokens_in: 0, tokens_out: 0 }))).toBeNull();
  });
  it("never shows usage for a running run", () => {
    expect(usageTokens(run({ status: "running", tokens_in: 10, tokens_out: 1 }))).toBeNull();
  });
});

describe("tsOf", () => {
  it("parses ISO timestamps to epoch ms", () => {
    expect(tsOf("2026-06-11T18:44:34.000Z")).toBe(Date.UTC(2026, 5, 11, 18, 44, 34));
  });
  it("sorts missing or unparseable timestamps last (0)", () => {
    expect(tsOf(null)).toBe(0);
    expect(tsOf(undefined)).toBe(0);
    expect(tsOf("not a date")).toBe(0);
  });
});

describe("timelineItems", () => {
  it("interleaves runs and commits newest first, undated items last", () => {
    const items = timelineItems(
      [run({ run_id: "r-new", ran_at: "2026-06-12T10:00:00Z" }), run({ run_id: "r-old", ran_at: "2026-06-10T10:00:00Z" })],
      [commit("c-mid", "2026-06-11T10:00:00Z"), commit("c-undated", null)],
    );
    expect(items.map((i) => (i.kind === "run" ? i.run.run_id : i.commit.sha))).toEqual([
      "r-new",
      "c-mid",
      "r-old",
      "c-undated",
    ]);
  });
});
