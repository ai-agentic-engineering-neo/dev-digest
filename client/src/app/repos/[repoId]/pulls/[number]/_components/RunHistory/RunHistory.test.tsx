/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
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

function renderRuns(
  runs: RunSummary[],
  props: Partial<React.ComponentProps<typeof RunHistory>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} {...props} />
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

  it("a settled run shows total tokens and cost under its timestamp", () => {
    renderRuns([run({ status: "done", tokens_in: 9000, tokens_out: 119, cost_usd: 0.0013, score: 80 })]);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("a run whose tokens are known but price is not keeps the tokens and dashes the price", () => {
    renderRuns([run({ status: "done", tokens_in: 12000, tokens_out: 11, cost_usd: null, score: 80 })]);
    expect(screen.getByText("12,011 tok · —")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("a run still going shows no cost badge at all", () => {
    renderRuns([run({ status: "running", tokens_in: null, tokens_out: null, cost_usd: null, score: null, blockers: null })]);
    expect(screen.queryByText(/tok ·/)).not.toBeInTheDocument();
  });
});

describe("RunHistory — severity indicators", () => {
  it("a tile shows its run's severity breakdown (AC-19)", () => {
    renderRuns([run({ run_id: "r1", status: "done", findings_count: 3, blockers: 1, score: 40 })], {
      severityByRun: { r1: { CRITICAL: 1, WARNING: 2, SUGGESTION: 0 } },
    });
    expect(screen.getByTestId("tile-severity-r1")).toHaveTextContent("1");
    expect(screen.getByTestId("tile-severity-r1")).toHaveTextContent("2");
  });

  it("a run with no findings gets no indicators (AC-19)", () => {
    renderRuns([run({ run_id: "r2", status: "done", findings_count: 0, blockers: 0, score: 95 })], {
      severityByRun: { r2: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } },
    });
    expect(screen.queryByTestId("tile-severity-r2")).not.toBeInTheDocument();
    expect(screen.getByText(/0 finding/)).toBeInTheDocument();
  });

  it("a failed run gets no indicators even when a breakdown is passed (AC-19)", () => {
    renderRuns([run({ run_id: "r3", status: "failed", error: "boom", score: null, blockers: null })], {
      severityByRun: { r3: { CRITICAL: 2, WARNING: 0, SUGGESTION: 0 } },
    });
    expect(screen.queryByTestId("tile-severity-r3")).not.toBeInTheDocument();
  });

  it("a commit tile carries no indicators (AC-19)", () => {
    renderRuns([], {
      commits: [{ sha: "abc1234", message: "fix things", author: "dev", committed_at: null }],
      severityByRun: { abc1234: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 } },
    });
    expect(screen.getByText("fix things")).toBeInTheDocument();
    expect(screen.queryByTestId(/tile-severity/)).not.toBeInTheDocument();
  });

  it("the indicators are not interactive (AC-20)", () => {
    renderRuns([run({ run_id: "r4", status: "done", findings_count: 2, blockers: 0, score: 60 })], {
      severityByRun: { r4: { CRITICAL: 0, WARNING: 2, SUGGESTION: 0 } },
    });
    const tile = screen.getByTestId("tile-severity-r4");
    expect(within(tile).queryAllByRole("button")).toHaveLength(0);
    expect(within(tile).queryAllByRole("link")).toHaveLength(0);
  });
});
