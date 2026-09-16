/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within, cleanup, fireEvent } from "@testing-library/react";
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
    cost_usd: 0.001,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    review_id: "rev-1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Line 12 contains a literal string starting with sk_live_.",
    suggestion: null,
    confidence: 0.98,
    kind: "finding",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function review(o: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rev-1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "Two critical exposures.",
    score: 38,
    model: "deepseek/deepseek-v4-flash",
    grounding: "2/2 passed",
    created_at: "2026-06-13T20:52:51.000Z",
    findings: [],
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

describe("RunHistory — cost", () => {
  it("a settled run with a known cost shows it formatted", () => {
    renderRuns([run({ status: "done", cost_usd: 0.0013 })]);
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });

  it("a settled run with no cost data shows '—', not '$0.00'", () => {
    renderRuns([run({ status: "done", cost_usd: null })]);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("a still-running run shows no cost line at all", () => {
    renderRuns([run({ status: "running", score: null, blockers: null, cost_usd: null })]);
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});

/**
 * The Timeline's per-run counter is joined client-side from the PR's reviews
 * (usePrReviews), matched by run_id — no extra request, no LLM call.
 */
describe("RunHistory — findings counter", () => {
  it("shows per-severity counters (not the plain finding count) when a matching review is passed", () => {
    renderRuns(
      [run({ run_id: "run-1", findings_count: 2, blockers: 1 })],
      [
        review({
          run_id: "run-1",
          findings: [
            finding({ id: "f1", severity: "CRITICAL" }),
            finding({ id: "f2", severity: "WARNING", title: "N+1 query" }),
          ],
        }),
      ],
    );
    // One CRITICAL + one WARNING ⇒ two "1" counters, not the plain "2 finding(s)".
    expect(screen.queryByText("2 finding(s)")).not.toBeInTheDocument();
    expect(screen.getAllByText("1")).toHaveLength(2);
  });

  it("falls back to the plain finding count when no review matches the run", () => {
    renderRuns([run({ run_id: "run-1", findings_count: 3 })], []);
    expect(screen.getByText("3 finding(s)")).toBeInTheDocument();
  });

  it("excludes a dismissed finding from the counter", () => {
    renderRuns(
      [run({ run_id: "run-1" })],
      [
        review({
          run_id: "run-1",
          findings: [
            finding({ id: "f1", severity: "CRITICAL" }),
            finding({ id: "f2", severity: "CRITICAL", dismissed_at: "2026-06-13T21:00:00.000Z" }),
          ],
        }),
      ],
    );
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("hovering the counter opens a read-only popover titled '... FINDINGS IN THIS RUN'", () => {
    const { container } = renderRuns(
      [run({ run_id: "run-1" })],
      [
        review({
          run_id: "run-1",
          findings: [finding({ id: "f1", severity: "CRITICAL" })],
        }),
      ],
    );
    const trigger = container.querySelector('button[aria-haspopup="dialog"]');
    expect(trigger).not.toBeNull();
    fireEvent.mouseEnter(trigger!);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("1 FINDINGS IN THIS RUN");
    expect(within(dialog).queryAllByRole("button")).toHaveLength(0);
  });
});
