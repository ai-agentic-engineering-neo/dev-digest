/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup } from "@/test/render";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
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

function renderRuns(runs: RunSummary[]) {
  return renderWithProviders(<RunHistory runs={runs} onOpenTrace={() => {}} />);
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

describe("RunHistory — usage line (tokens · cost)", () => {
  it("a done run shows total tokens and its cost", () => {
    renderRuns([run({ status: "done", tokens_in: 12011, tokens_out: 980, cost_usd: 0.0014 })]);
    expect(screen.getByText(/12,991 tok/)).toBeInTheDocument();
    expect(screen.getByText("$0.0014")).toBeInTheDocument();
    expect(screen.getByTitle("12,011 in → 980 out")).toBeInTheDocument();
  });

  it("a done run with unknown cost shows tokens only", () => {
    renderRuns([run({ status: "done", tokens_in: 100, tokens_out: 50, cost_usd: null })]);
    expect(screen.getByText("150 tok")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("a failed run that spent tokens shows what it spent", () => {
    renderRuns([run({ status: "failed", error: "boom", tokens_in: 4000, tokens_out: 200, cost_usd: 0.011 })]);
    expect(screen.getByText(/4,200 tok/)).toBeInTheDocument();
    expect(screen.getByText("$0.011")).toBeInTheDocument();
  });

  it("a failed run with 0 tokens shows no usage line", () => {
    renderRuns([run({ status: "failed", error: "429", tokens_in: 0, tokens_out: 0, cost_usd: 0 })]);
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
  });

  it("a running run shows no usage line", () => {
    renderRuns([run({ status: "running", tokens_in: null, tokens_out: null, cost_usd: null })]);
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
  });
});

describe("RunHistory — per-run severity counters + popover", () => {
  const f = (id: string, severity: FindingRecord["severity"], title: string): FindingRecord =>
    ({
      id,
      severity,
      category: "perf",
      title,
      file: "src/api/users.ts",
      start_line: 45,
      end_line: 52,
      rationale: "The loop calls findMany once per user.",
      suggestion: null,
      confidence: 0.86,
      kind: "finding",
      trifecta_components: null,
      evidence: null,
      review_id: "rv",
      accepted_at: null,
      dismissed_at: null,
    }) as FindingRecord;

  it("shows the run's counts; hovering lists that run's findings (no actions)", async () => {
    const findings = [f("a", "WARNING", "N+1 query in user list endpoint"), f("b", "SUGGESTION", "Extract magic number")];
    const { user } = renderWithProviders(
      <RunHistory
        runs={[run({ findings_count: 2, score: 64 })]}
        findingsByRun={new Map([["run-1", findings]])}
        onOpenTrace={() => {}}
      />,
    );
    const counters = screen.getByLabelText("1 warning, 1 suggestion");
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.hover(counters);
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("2 findings in this run");
    expect(tip).toHaveTextContent("N+1 query in user list endpoint");
    expect(tip).toHaveTextContent("src/api/users.ts:45-52");
    expect(tip).toHaveTextContent("86%");
    expect(tip.querySelector("button")).toBeNull();
    await user.unhover(counters);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("falls back to the plain count when the run's findings are not loaded", () => {
    renderRuns([run({ findings_count: 3 })]);
    expect(screen.getByText("3 findings")).toBeInTheDocument();
  });
});

describe("RunHistory — actions", () => {
  it("the agent name jumps to the run's review; the icons open the trace and delete", async () => {
    const onGoToReview = vi.fn();
    const onOpenTrace = vi.fn();
    const onDelete = vi.fn();
    const { user } = renderWithProviders(
      <RunHistory runs={[run({})]} onOpenTrace={onOpenTrace} onGoToReview={onGoToReview} onDelete={onDelete} />,
    );
    await user.click(screen.getByRole("button", { name: "Security Reviewer" }));
    expect(onGoToReview).toHaveBeenCalledWith("run-1");
    await user.click(screen.getByRole("button", { name: "Open run trace & logs" }));
    expect(onOpenTrace).toHaveBeenCalledWith("run-1");
    screen.getByRole("button", { name: "Delete run" }).focus();
    await user.keyboard("{Enter}");
    expect(onDelete).toHaveBeenCalledWith("run-1");
  });

  it("without onGoToReview the agent name is plain text, not a button", () => {
    renderRuns([run({})]);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Security Reviewer" })).toBeNull();
  });

  it("a running run cannot be deleted", () => {
    renderWithProviders(<RunHistory runs={[run({ status: "running" })]} onOpenTrace={() => {}} onDelete={() => {}} />);
    expect(screen.queryByRole("button", { name: "Delete run" })).toBeNull();
  });
});
