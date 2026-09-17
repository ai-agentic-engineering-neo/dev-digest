/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingsSummary, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../../messages/en/common.json";
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
    findings: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
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

const FINDINGS: FindingsSummary = {
  counts: { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 },
  items: [
    { id: "f1", severity: "CRITICAL", category: "security", title: "Leaked key", file: "src/a.ts", start_line: 3, end_line: 3, confidence: 0.9, rationale: "r" },
    { id: "f2", severity: "CRITICAL", category: "bug", title: "Null deref", file: "src/b.ts", start_line: 7, end_line: 9, confidence: 0.8, rationale: "r" },
    { id: "f3", severity: "WARNING", category: "perf", title: "N+1", file: "src/c.ts", start_line: 1, end_line: 1, confidence: 0.6, rationale: "r" },
  ],
};

describe("RunHistory — findings labels", () => {
  it("a done run shows per-severity badges (non-zero only) + the blockers suffix", () => {
    const { container } = renderRuns([
      run({ status: "done", findings_count: 3, blockers: 2, score: 40, findings: FINDINGS }),
    ]);
    expect(screen.getByLabelText("3 findings")).toBeInTheDocument();
    expect(container.querySelector('[data-severity="CRITICAL"]')?.textContent).toBe("2");
    expect(container.querySelector('[data-severity="WARNING"]')?.textContent).toBe("1");
    expect(container.querySelector('[data-severity="SUGGESTION"]')).toBeNull();
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
    expect(screen.queryByText("3 finding(s)")).not.toBeInTheDocument();
  });

  it("a done run with an empty breakdown shows — instead of badges", () => {
    const { container } = renderRuns([
      run({ status: "done", score: 95, cost_usd: 0.001, findings: { counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }, items: [] } }),
    ]);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(container.querySelector("[data-severity]")).toBeNull();
    expect(screen.queryByText(/finding/)).not.toBeInTheDocument();
  });

  it("falls back to the plain count when the server sent no breakdown", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72, findings: null })]);
    expect(screen.getByText("3 finding(s)")).toBeInTheDocument();
  });
});

describe("RunHistory — cost badge", () => {
  it("a done run shows cost · tokens in→out", () => {
    renderRuns([run({ status: "done", cost_usd: 0.0013, tokens_in: 9119, tokens_out: 1240, score: 90 })]);
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
    expect(screen.getByText("· 9.1K→1.2K")).toBeInTheDocument();
  });

  it("a done run without a known cost shows — but keeps its tokens", () => {
    renderRuns([run({ status: "done", cost_usd: null, tokens_in: 9119, tokens_out: 1240, score: 90 })]);
    expect(screen.getByText("· 9.1K→1.2K")).toBeInTheDocument();
    expect(screen.queryByText(/\$0/)).not.toBeInTheDocument();
  });

  it("failed and running runs show no cost badge", () => {
    renderRuns([
      run({ run_id: "f", status: "failed", error: "boom", cost_usd: null }),
      run({ run_id: "r", status: "running", cost_usd: null }),
    ]);
    expect(screen.queryByTitle("Cost of this review")).not.toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });
});
