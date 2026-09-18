/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, ReviewRecord, FindingRecord } from "@devdigest/shared";
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
    ...o,
  };
}

function renderRuns(runs: RunSummary[], reviews?: ReviewRecord[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} reviews={reviews} onOpenTrace={() => {}} />
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

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "perf",
    title: "N+1 query in user list endpoint",
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    rationale: "The loop calls findMany once per user.",
    suggestion: null,
    confidence: 0.86,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function review(o: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rv1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: null,
    summary: null,
    score: 64,
    model: "m",
    grounding: null,
    created_at: "2026-06-11T18:44:34.000Z",
    findings: [],
    ...o,
  };
}

describe("RunHistory — severity chips", () => {
  it("replaces the flat count with per-severity chips when the run's review is matched", () => {
    renderRuns(
      [run({ findings_count: 2, blockers: 0, score: 64 })],
      [review({ findings: [finding({ id: "f1" }), finding({ id: "f2", severity: "SUGGESTION" })] })],
    );
    expect(screen.queryByText("2 finding(s)")).not.toBeInTheDocument();
    expect(screen.getByTitle("WARNING")).toBeInTheDocument();
    expect(screen.getByTitle("SUGGESTION")).toBeInTheDocument();
  });

  it("keeps the blockers note beside the chips", () => {
    renderRuns(
      [run({ findings_count: 1, blockers: 1, score: 0 })],
      [review({ findings: [finding({ severity: "CRITICAL" })] })],
    );
    expect(screen.getByText(/1 blockers/)).toBeInTheDocument();
  });

  // A run whose review row was deleted keeps its denormalized findings_count,
  // so it must fall back to the text line rather than silently show nothing.
  it("falls back to the count text when no review matches the run", () => {
    renderRuns([run({ findings_count: 3, blockers: 0, score: 70 })], []);
    expect(screen.getByText("3 finding(s)")).toBeInTheDocument();
  });

  it("does not count dismissed findings", () => {
    renderRuns(
      [run({ findings_count: 2, blockers: 0, score: 64 })],
      [
        review({
          findings: [
            finding({ id: "f1", severity: "CRITICAL" }),
            finding({ id: "f2", severity: "WARNING", dismissed_at: "2026-06-12T00:00:00Z" }),
          ],
        }),
      ],
    );
    expect(screen.getByTitle("CRITICAL")).toBeInTheDocument();
    expect(screen.queryByTitle("WARNING")).not.toBeInTheDocument();
  });

  it("hovering the chips opens the findings preview", () => {
    renderRuns([run({ findings_count: 1, blockers: 0, score: 64 })], [review({ findings: [finding({})] })]);
    expect(screen.queryByText("1 findings in this run")).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTitle("WARNING").closest("div")!);
    expect(screen.getByText("1 findings in this run")).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:45")).toBeInTheDocument();
    expect(screen.getByText("86% conf")).toBeInTheDocument();
  });
});
