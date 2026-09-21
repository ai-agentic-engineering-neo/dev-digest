/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    cost_usd: null,
    ...o,
  };
}

function finding(o: Partial<FindingRecord> & { id: string; severity: FindingRecord["severity"] }): FindingRecord {
  return {
    category: "bug",
    title: "A finding",
    file: "src/foo.ts",
    start_line: 1,
    end_line: 1,
    rationale: "because.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[], findingsByRunId?: Record<string, FindingRecord[]>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} findingsByRunId={findingsByRunId} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
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

describe("RunHistory — per-tile severity icons", () => {
  it("shows an icon+count per present severity, with no severity word (compact)", () => {
    renderRuns(
      [run({ run_id: "run-1", status: "done", findings_count: 3, blockers: 1, score: 40 })],
      { "run-1": [finding({ id: "f1", severity: "CRITICAL" }), finding({ id: "f2", severity: "WARNING" }), finding({ id: "f3", severity: "WARNING" })] },
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("Critical")).not.toBeInTheDocument();
    expect(screen.queryByText("Warning")).not.toBeInTheDocument();
    expect(screen.queryByText("Suggestion")).not.toBeInTheDocument();
  });

  it("shows nothing when the run has zero findings — no '0 finding(s)' text", () => {
    renderRuns([run({ run_id: "run-2", status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.queryByText(/finding/i)).not.toBeInTheDocument();
  });

  it("falls back to plain '{count} finding(s)' text when findings_count > 0 but no breakdown is supplied", () => {
    renderRuns([run({ run_id: "run-3", status: "done", findings_count: 2, blockers: 0, score: 80 })]);
    expect(screen.getByText("2 finding(s)")).toBeInTheDocument();
  });

  it("clicking the severity icons opens a modal listing that run's findings", () => {
    renderRuns(
      [run({ run_id: "run-1", status: "done", findings_count: 1, blockers: 1, score: 20 })],
      { "run-1": [finding({ id: "f1", severity: "CRITICAL", title: "All endpoints unauthenticated" })] },
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("1"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("All endpoints unauthenticated")).toBeInTheDocument();
  });
});

describe("RunHistory — tokens next to cost", () => {
  it("shows the token count to the left of the cost for a settled run", () => {
    renderRuns([run({ status: "done", tokens_in: 12000, tokens_out: 1500, cost_usd: 0.0002, score: 90 })]);
    const tokens = screen.getByText("13.5k");
    const cost = screen.getByText("$0.0002");
    expect(tokens).toBeInTheDocument();
    expect(cost).toBeInTheDocument();
    // Same row, tokens precede cost in document order (left, given the row is LTR).
    expect(tokens.compareDocumentPosition(cost) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("omits the token count when tokens are unavailable (e.g. a failed run)", () => {
    renderRuns([run({ status: "done", tokens_in: null, tokens_out: null, cost_usd: 0.05 })]);
    const cost = screen.getByText("$0.0500");
    // Cost's wrapper row has no other (token) child next to it.
    expect(cost.parentElement?.textContent).toBe("$0.0500");
  });
});
