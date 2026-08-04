/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
// RunCostBadge on each settled row reads the `runs` namespace.
import runsMessages from "../../../../../../../../messages/en/runs.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "perf",
    title: "N+1 query in user list endpoint",
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    rationale: "The loop calls db.posts.findMany once per user.",
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
    critical_count: null,
    warning_count: null,
    suggestion_count: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[], findingsByRun?: Map<string, FindingRecord[]>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, runs: runsMessages }}>
      <RunHistory runs={runs} findingsByRun={findingsByRun} onOpenTrace={() => {}} />
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

describe("RunHistory — per-severity finding counts", () => {
  it("renders a chip per non-zero severity, omitting zero-count severities", () => {
    renderRuns([
      run({ status: "done", findings_count: 3, blockers: 2, critical_count: 2, warning_count: 1, suggestion_count: 0 }),
    ]);
    expect(screen.getByText("2")).toBeInTheDocument(); // CRITICAL chip
    expect(screen.getByText("1")).toBeInTheDocument(); // WARNING chip
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
  });

  it("renders no severity chips when counts are null (pre-migration run)", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0 })]);
    expect(screen.queryByText("Critical")).not.toBeInTheDocument();
    expect(screen.queryByText("Warning")).not.toBeInTheDocument();
    expect(screen.queryByText("Suggestion")).not.toBeInTheDocument();
  });
});

describe("RunHistory — findings hover preview", () => {
  afterEach(() => vi.useRealTimers());

  it("previews all of a run's findings, combined across severities, on hover", () => {
    vi.useFakeTimers();
    const findingsByRun = new Map<string, FindingRecord[]>([
      [
        "run-1",
        [
          finding({ id: "f1", severity: "WARNING", title: "N+1 query in user list endpoint" }),
          finding({ id: "f2", severity: "SUGGESTION", title: "Extract magic number 3600", category: "style" }),
        ],
      ],
    ]);
    renderRuns(
      [run({ status: "done", findings_count: 2, blockers: 0, warning_count: 1, suggestion_count: 1 })],
      findingsByRun,
    );

    expect(screen.queryByText("N+1 query in user list endpoint")).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: "2 findings" });
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.getByText("2 findings")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
    expect(screen.getByText("Extract magic number 3600")).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByText("N+1 query in user list endpoint")).not.toBeInTheDocument();
  });

  it("does not make the chip row interactive when no findings are loaded for the run", () => {
    renderRuns([run({ status: "done", findings_count: 1, blockers: 0, warning_count: 1 })]);
    expect(screen.queryByRole("button", { name: /findings/ })).not.toBeInTheDocument();
  });
});
