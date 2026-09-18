/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    review_id: "rv1",
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
    ...o,
  };
}

function renderRuns(runs: RunSummary[], findingsByRun?: Map<string, FindingRecord[]>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
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

describe("RunHistory — cost badge", () => {
  it("a settled run with cost data shows its own cost + tokens", () => {
    renderRuns([run({ status: "done", score: 61, cost_usd: 0.014, tokens_in: 8200, tokens_out: 1300 })]);
    expect(screen.getByText("$0.014 · 8.2K→1.3K")).toBeInTheDocument();
  });

  it("a settled run with no cost data shows the dash, not $0.00", () => {
    renderRuns([run({ status: "done", score: 61, cost_usd: null })]);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("a running run shows no cost line at all (not a dash)", () => {
    renderRuns([run({ status: "running", score: null, blockers: null, cost_usd: null })]);
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("a failed run shows no cost line at all", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null, cost_usd: null })]);
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("each run in the Timeline shows ITS OWN cost, not a shared value", () => {
    renderRuns([
      run({ run_id: "run-1", status: "done", score: 61, cost_usd: 0.014 }),
      run({ run_id: "run-2", status: "done", score: 44, cost_usd: 0.041 }),
    ]);
    expect(screen.getByText(/^\$0\.014/)).toBeInTheDocument();
    expect(screen.getByText(/^\$0\.041/)).toBeInTheDocument();
  });
});

describe("RunHistory — per-run findings breakdown", () => {
  it("shows a severity breakdown and keeps the blockers text", () => {
    renderRuns(
      [run({ run_id: "run-1", status: "done", findings_count: 3, blockers: 2, score: 38 })],
      new Map([
        [
          "run-1",
          [
            finding({ id: "f1", severity: "CRITICAL" }),
            finding({ id: "f2", severity: "CRITICAL" }),
            finding({ id: "f3", severity: "WARNING" }),
          ],
        ],
      ]),
    );
    const trigger = screen.getByRole("button", { name: /Show 3 findings/ });
    expect(trigger.textContent).toBe("21"); // 2 critical, 1 warning
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
  });

  it("opens that one run's findings, scoped to the run", () => {
    renderRuns(
      [run({ run_id: "run-1", status: "done", findings_count: 1, blockers: 0, score: 64 })],
      new Map([["run-1", [finding({ id: "f1" })]]]),
    );
    fireEvent.click(screen.getByRole("button", { name: /Show 1 findings/ }));
    expect(screen.getByText("1 findings in this run")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
  });

  it("excludes dismissed findings from the counts", () => {
    renderRuns(
      [run({ run_id: "run-1", status: "done", findings_count: 2, blockers: 0, score: 64 })],
      new Map([
        [
          "run-1",
          [
            finding({ id: "f1", severity: "WARNING" }),
            finding({ id: "f2", severity: "WARNING", dismissed_at: "2026-06-12T00:00:00.000Z" }),
          ],
        ],
      ]),
    );
    // One outstanding, though the run's frozen findings_count still says 2.
    expect(screen.getByRole("button", { name: /Show 1 findings/ }).textContent).toBe("1");
  });

  it("each run shows ITS OWN breakdown", () => {
    renderRuns(
      [
        run({ run_id: "run-1", status: "done", findings_count: 2, blockers: 2, score: 38 }),
        run({ run_id: "run-2", status: "done", findings_count: 1, blockers: 0, score: 64 }),
      ],
      new Map([
        ["run-1", [finding({ id: "f1", severity: "CRITICAL" }), finding({ id: "f2", severity: "CRITICAL" })]],
        ["run-2", [finding({ id: "f3", severity: "SUGGESTION" })]],
      ]),
    );
    expect(screen.getByRole("button", { name: /Show 2 findings/ }).textContent).toBe("2");
    expect(screen.getByRole("button", { name: /Show 1 findings/ }).textContent).toBe("1");
  });

  it("falls back to the run's own count when the caller has no findings for it", () => {
    renderRuns([run({ run_id: "run-1", status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("3 finding(s)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show/ })).not.toBeInTheDocument();
  });

  it("reads zero findings when every finding on the run was dismissed", () => {
    renderRuns(
      [run({ run_id: "run-1", status: "done", findings_count: 1, blockers: 0, score: 88 })],
      new Map([["run-1", [finding({ id: "f1", dismissed_at: "2026-06-12T00:00:00.000Z" })]]]),
    );
    expect(screen.getByText("0 finding(s)")).toBeInTheDocument();
  });
});
