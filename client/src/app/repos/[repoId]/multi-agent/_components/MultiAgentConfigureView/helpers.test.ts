import { describe, it, expect } from "vitest";
import type { AgentRunEstimate } from "@devdigest/shared/contracts/observability";
import { aggregateEstimate } from "./helpers";

const ESTIMATES: AgentRunEstimate[] = [
  { agent_id: "a1", agent_name: "Security", runs: 4, avg_duration_ms: 8200, avg_cost_usd: 0.06 },
  { agent_id: "a2", agent_name: "Style", runs: 2, avg_duration_ms: 3100, avg_cost_usd: 0.04 },
  { agent_id: "a3", agent_name: "New agent", runs: 0, avg_duration_ms: null, avg_cost_usd: null },
];

describe("aggregateEstimate (AC-6)", () => {
  it("aggregates to MAX duration and SUM cost across selected agents", () => {
    expect(aggregateEstimate(["a1", "a2"], ESTIMATES)).toEqual({ durationMs: 8200, costUsd: 0.1 });
  });

  it("an agent with no estimate contributes nothing — it neither raises nor zeroes the aggregate", () => {
    expect(aggregateEstimate(["a1", "a3"], ESTIMATES)).toEqual({ durationMs: 8200, costUsd: 0.06 });
  });

  it("returns null/null (never 0) when nothing selected has any estimate at all (AC-5)", () => {
    expect(aggregateEstimate(["a3"], ESTIMATES)).toEqual({ durationMs: null, costUsd: null });
  });

  it("returns null/null for an empty selection", () => {
    expect(aggregateEstimate([], ESTIMATES)).toEqual({ durationMs: null, costUsd: null });
  });
});
