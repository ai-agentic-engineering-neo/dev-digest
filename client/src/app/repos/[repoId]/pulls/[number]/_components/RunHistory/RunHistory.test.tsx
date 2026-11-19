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
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[], findingsByRun?: React.ComponentProps<typeof RunHistory>["findingsByRun"]) {
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
  it("a done run shows tokens (in+out) and cost next to the timestamp", () => {
    renderRuns([run({ tokens_in: 8000, tokens_out: 1119, cost_usd: 0.0013 })]);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("a done run without cost data shows '—' for cost, never $0.00", () => {
    renderRuns([run({ tokens_in: 100, tokens_out: 50, cost_usd: null })]);
    expect(screen.getByText("150 tok · —")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });

  it("a failed run shows no cost badge", () => {
    renderRuns([run({ status: "failed", error: "boom", cost_usd: null, tokens_in: 0, tokens_out: 0 })]);
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
  });
});

const F = (id: string, severity: FindingRecord["severity"], title: string): FindingRecord => ({
  id, severity, category: "perf", title, file: "src/a.ts", start_line: 4, end_line: 9,
  rationale: "Because reasons.", suggestion: null, confidence: 0.86, kind: "finding",
  trifecta_components: null, evidence: null, review_id: "r1", accepted_at: null, dismissed_at: null,
});

describe("RunHistory — severity icons + hover", () => {
  const data = { "run-1": [F("1", "CRITICAL", "Boom"), F("2", "CRITICAL", "Bang"), F("3", "WARNING", "Hmm")] };

  it("shows an icon + count per non-zero severity instead of the plain findings text", () => {
    renderRuns([run({ findings_count: 3 })], data);
    expect(screen.getByLabelText("2 CRITICAL")).toBeInTheDocument();
    expect(screen.getByLabelText("1 WARNING")).toBeInTheDocument();
    expect(screen.queryByLabelText("0 SUGGESTION")).not.toBeInTheDocument();
    expect(screen.queryByText(/finding\(s\)/)).not.toBeInTheDocument();
  });

  it("hover shows the findings popover and mouse-leave hides it", () => {
    renderRuns([run({ findings_count: 3 })], data);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByLabelText("2 CRITICAL").parentElement!.parentElement!);
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("3 findings in this run");
    expect(tip).toHaveTextContent("Boom");
    expect(tip).toHaveTextContent("src/a.ts:4-9");
    expect(tip).toHaveTextContent("86% conf");
    expect(tip).toHaveTextContent("Because reasons.");
    fireEvent.mouseLeave(screen.getByLabelText("2 CRITICAL").parentElement!.parentElement!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("falls back to the findings text when there is no breakdown", () => {
    renderRuns([run({ findings_count: 1 })]);
    expect(screen.getByText(/1 finding/)).toBeInTheDocument();
  });
});
