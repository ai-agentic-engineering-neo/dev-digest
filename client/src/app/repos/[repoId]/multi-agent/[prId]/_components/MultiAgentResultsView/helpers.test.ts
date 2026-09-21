import { describe, it, expect } from "vitest";
import type { AgentColumn } from "@devdigest/shared/contracts/observability";
import { formatSeconds, participatingCount, allFailed, sharedFailureReason } from "./helpers";

function col(overrides: Partial<AgentColumn>): AgentColumn {
  return {
    run_id: "r1",
    agent_id: "a1",
    agent_name: "Security",
    provider: "openrouter",
    model: "gpt-4.1",
    status: "done",
    verdict: null,
    score: null,
    summary: null,
    duration_ms: null,
    cost_usd: null,
    error: null,
    findings: [],
    ...overrides,
  };
}

describe("formatSeconds", () => {
  it("renders one decimal place", () => {
    expect(formatSeconds(8200)).toBe("8.2s");
  });
});

describe("participatingCount (AC-38, AC-40 vs AC-42)", () => {
  it("counts only status='done' columns — failed/cancelled/running never participate", () => {
    const columns = [col({ status: "done" }), col({ status: "failed" }), col({ status: "cancelled" }), col({ status: "running" })];
    expect(participatingCount(columns)).toBe(1);
  });
});

describe("allFailed / sharedFailureReason (AC-49, AC-50)", () => {
  it("allFailed is false when at least one column succeeded", () => {
    expect(allFailed([col({ status: "done" }), col({ status: "failed" })])).toBe(false);
  });

  it("allFailed is true when every column failed", () => {
    expect(allFailed([col({ status: "failed" }), col({ status: "failed" })])).toBe(true);
  });

  it("sharedFailureReason returns the ONE reason when every failed column carries the identical error", () => {
    const columns = [
      col({ status: "failed", error: "diff load failed: timeout" }),
      col({ status: "failed", error: "diff load failed: timeout" }),
    ];
    expect(sharedFailureReason(columns)).toBe("diff load failed: timeout");
  });

  it("sharedFailureReason returns null when reasons differ — caller must list each one", () => {
    const columns = [
      col({ status: "failed", error: "provider timeout" }),
      col({ status: "failed", error: "rate limited" }),
    ];
    expect(sharedFailureReason(columns)).toBeNull();
  });

  it("sharedFailureReason returns null when not every column failed", () => {
    const columns = [col({ status: "done" }), col({ status: "failed", error: "x" })];
    expect(sharedFailureReason(columns)).toBeNull();
  });
});
