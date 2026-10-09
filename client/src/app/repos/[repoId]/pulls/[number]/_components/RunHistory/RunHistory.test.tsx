/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import commonMessages from "../../../../../../../../messages/en/common.json";
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

function renderRuns(runs: RunSummary[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, common: commonMessages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} />
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

describe("RunHistory — run cost", () => {
  it("a done run shows total tokens and its USD cost", () => {
    renderRuns([run({ status: "done", tokens_in: 9000, tokens_out: 119, cost_usd: 0.0013 })]);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("a done run with unknown cost shows only tokens, never $0.00", () => {
    renderRuns([run({ status: "done", tokens_in: 900, tokens_out: 100, cost_usd: null })]);
    expect(screen.getByText("1,000 tok")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });

  it("a failed run shows no cost", () => {
    renderRuns([run({ status: "failed", error: "429 quota", tokens_in: 0, tokens_out: 0, cost_usd: null })]);
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});

describe("RunHistory — severity icons + findings popover", () => {
  const review = {
    id: "rev-1",
    pr_id: "pr-1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review" as const,
    verdict: "request_changes" as const,
    summary: null,
    score: 38,
    model: null,
    created_at: "2026-06-11T18:44:34.000Z",
    findings: (["CRITICAL", "CRITICAL", "WARNING"] as const).map((severity, i) => ({
      id: `f${i}`,
      severity,
      category: "security" as const,
      title: `Finding ${i}`,
      file: "src/config.ts",
      start_line: 12,
      end_line: 12,
      rationale: "Why it matters.",
      suggestion: null,
      confidence: 0.9,
      kind: "finding" as const,
      trifecta_components: null,
      evidence: null,
      review_id: "rev-1",
      accepted_at: null,
      dismissed_at: null,
    })),
  };

  function renderWithReview(onOpenTrace = vi.fn()) {
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, common: commonMessages }}>
        <RunHistory
          runs={[run({ status: "done", findings_count: 3, blockers: 2, score: 38 })]}
          onOpenTrace={onOpenTrace}
          reviewsByRunId={new Map([["run-1", review]])}
        />
      </NextIntlClientProvider>,
    );
    return onOpenTrace;
  }

  it("a done run tile shows per-severity counts and its blockers", () => {
    renderWithReview();
    expect(screen.getByLabelText("2 Critical")).toBeInTheDocument();
    expect(screen.getByLabelText("1 Warning")).toBeInTheDocument();
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
  });

  it("hovering the icons opens a read-only popover of the run's findings", () => {
    const onOpenTrace = renderWithReview();
    fireEvent.mouseEnter(screen.getByLabelText("2 Critical"));
    const dialog = screen.getByRole("dialog", { name: "3 findings" });
    expect(within(dialog).getByText("Finding 0")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("2 Critical"));
    expect(onOpenTrace).not.toHaveBeenCalled();
  });
});
