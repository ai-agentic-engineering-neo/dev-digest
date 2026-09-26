/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import messages from "@messages/en/prReview.json";
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
    ...o,
  };
}

function renderRuns(runs: RunSummary[], reviews: ReviewRecord[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} reviews={reviews} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "WARNING",
    category: "perf",
    title: `finding ${o.id}`,
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    rationale: "one query per user",
    confidence: 0.86,
    review_id: "rev-1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

function review(runId: string | null, findings: FindingRecord[]): ReviewRecord {
  return {
    id: "rev-1",
    pr_id: "pr-1",
    agent_id: "a1",
    run_id: runId,
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "s",
    score: 61,
    model: "m",
    grounding: null,
    created_at: "2026-06-11T18:44:34.000Z",
    findings,
  } as ReviewRecord;
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

  it("a priced run shows its token total and cost", () => {
    renderRuns([run({ status: "done", tokens_in: 9000, tokens_out: 119, cost_usd: 0.0013 })]);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("a run with tokens but no price shows tokens alone, never a dangling dot", () => {
    renderRuns([run({ status: "done", tokens_in: 9000, tokens_out: 119, cost_usd: null })]);
    expect(screen.getByText("9,119 tok")).toBeInTheDocument();
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it("a failed run shows no usage line at all", () => {
    renderRuns([
      run({ status: "failed", error: "boom", tokens_in: 0, tokens_out: 0, cost_usd: null }),
    ]);
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
  });
});

describe("RunHistory — per-run severity chips", () => {
  const runFindings = [
    finding({ id: "f1", severity: "CRITICAL", title: "Hardcoded Stripe secret key in commit" }),
    finding({ id: "f2", severity: "WARNING", file: "src/middleware/ratelimit.ts", start_line: 28, end_line: 28 }),
  ];

  it("breaks a matched run's findings down by severity instead of just totalling them", () => {
    renderRuns(
      [run({ status: "done", findings_count: 2, blockers: 1, score: 61 })],
      [review("run-1", runFindings)],
    );
    // The chips replace the flat "2 finding(s)" line; blockers stay alongside.
    expect(screen.queryByText(/finding\(s\)/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 blockers/)).toBeInTheDocument();
    expect(screen.getAllByText("1")).not.toHaveLength(0);
  });

  it("falls back to the denormalized total when no review matches the run", () => {
    // Its review was deleted, or the run predates run_id — either way the row
    // must still say something rather than going blank.
    renderRuns([run({ status: "done", findings_count: 2, blockers: 1 })], [review(null, runFindings)]);
    expect(screen.getByText(/2 finding\(s\)/)).toBeInTheDocument();
  });

  it("opens the run's findings preview on hover", () => {
    renderRuns(
      [run({ status: "done", findings_count: 2, blockers: 1, score: 61 })],
      [review("run-1", runFindings)],
    );
    fireEvent.mouseEnter(screen.getByText(/1 blockers/).parentElement!);

    expect(screen.getByText("2 findings in this run")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:45-52")).toBeInTheDocument();
  });
});
