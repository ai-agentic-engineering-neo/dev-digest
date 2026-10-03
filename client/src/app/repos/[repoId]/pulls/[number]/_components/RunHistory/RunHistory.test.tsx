/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
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
    repo_intel_degraded: false,
    ...o,
  };
}

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "perf",
    title: "N+1 query",
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    rationale: "Loop calls a query per user.",
    suggestion: null,
    confidence: 0.86,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[], findingsByRunId?: Map<string, FindingRecord[]>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} findingsByRunId={findingsByRunId} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — cost badge", () => {
  it("a settled run shows tokens + cost near its timestamp", () => {
    renderRuns([run({ status: "done", tokens_in: 9000, tokens_out: 119, cost_usd: 0.0013 })]);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("a settled run with no cost data shows tokens alone, never $0.00", () => {
    renderRuns([run({ status: "done", tokens_in: 12000, tokens_out: 11, cost_usd: null })]);
    expect(screen.getByText("12,011 tok")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });

  it("a running (unsettled) run shows no cost badge yet", () => {
    renderRuns([run({ status: "running", score: null, blockers: null, cost_usd: null })]);
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
  });
});

describe("RunHistory — severity pills", () => {
  it("renders severity icon pills instead of plain text when findings are known", () => {
    const r = run({ status: "done", findings_count: 3, blockers: 1 });
    const findingsByRunId = new Map([
      [
        r.run_id,
        [
          finding({ id: "f1", severity: "CRITICAL" }),
          finding({ id: "f2", severity: "CRITICAL" }),
          finding({ id: "f3", severity: "WARNING" }),
        ],
      ],
    ]);
    renderRuns([r], findingsByRunId);
    expect(screen.queryByText("3 finding(s)")).not.toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // CRITICAL pill count
    expect(screen.getByText("1")).toBeInTheDocument(); // WARNING pill count
    // blockers text still appends after the pills
    expect(screen.getByText(/1 blockers/)).toBeInTheDocument();
  });

  it("falls back to plain text when no findings data is available yet", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0 })]);
    expect(screen.getByText("3 finding(s)")).toBeInTheDocument();
  });

  it("hovering the pills reveals the same read-only findings popover as the PR list", () => {
    const r = run({ status: "done", findings_count: 1 });
    const findingsByRunId = new Map([[r.run_id, [finding({ title: "N+1 query in user list endpoint" })]]]);
    renderRuns([r], findingsByRunId);
    expect(screen.queryByText(/FINDINGS IN THIS RUN/)).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByText("1").closest("div")!);
    expect(screen.getByText("1 FINDINGS IN THIS RUN")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
  });
});
