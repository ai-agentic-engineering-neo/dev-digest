/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary } from "@devdigest/shared";
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

function renderRuns(runs: RunSummary[], severityByRun?: Record<string, Partial<Record<string, number>>>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} severityByRun={severityByRun as never} />
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

/** Run cost badge (L01): settled runs show "N tok · $x"; no cost → "—"; unsettled → nothing. */
describe("RunHistory — run cost badge", () => {
  it("a done run shows total tokens and cost", () => {
    renderRuns([run({ status: "done", tokens_in: 8190, tokens_out: 929, cost_usd: 0.0013, score: 61 })]);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("a done run without a known cost shows an em dash, not $0.00", () => {
    renderRuns([run({ status: "done", cost_usd: null, score: 90 })]);
    expect(screen.getByTestId("run-cost-badge")).toHaveTextContent("—");
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });

  it("failed and running runs show no badge", () => {
    renderRuns([
      run({ run_id: "f", status: "failed", error: "boom", cost_usd: null }),
      run({ run_id: "r", status: "running", cost_usd: null }),
    ]);
    expect(screen.queryByTestId("run-cost-badge")).not.toBeInTheDocument();
  });
});

/** Timeline tiles show severity icons with counts (display only, no click). */
describe("RunHistory — severity icons on the tile", () => {
  it("renders one icon+count per severity present", () => {
    renderRuns([run({ run_id: "r1", status: "done", findings_count: 3, blockers: 2, score: 30 })], {
      r1: { CRITICAL: 2, WARNING: 1 },
    });
    expect(screen.getByTitle("Critical")).toHaveTextContent("2");
    expect(screen.getByTitle("Warning")).toHaveTextContent("1");
    expect(screen.queryByTitle("Suggestion")).not.toBeInTheDocument();
  });
});
