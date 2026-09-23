/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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

describe("RunHistory — run cost (server/specs/01-run-cost-badge.md)", () => {
  it("a done run shows its cost and in→out tokens", () => {
    renderRuns([run({ status: "done", score: 64, cost_usd: 0.0013, tokens_in: 8212, tokens_out: 1301 })]);
    expect(screen.getByText("$0.0013 · 8.2K→1.3K")).toBeInTheDocument();
  });

  it("a done run with an unknown cost reads '—', never '$0.00'", () => {
    renderRuns([run({ status: "done", score: 64, cost_usd: null, tokens_in: 8212, tokens_out: 1301 })]);
    expect(screen.getByText("— · 8.2K→1.3K")).toBeInTheDocument();
  });

  it("a failed run reads '—', never '$0.00'", () => {
    renderRuns([run({ status: "failed", error: "429 quota", cost_usd: null, tokens_in: 0, tokens_out: 0 })]);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/\$|→/)).not.toBeInTheDocument();
  });

  it("a running or cancelled run reads '—' too", () => {
    renderRuns([
      run({ run_id: "run-1", status: "running", cost_usd: null, tokens_in: null, tokens_out: null }),
      run({ run_id: "run-2", status: "cancelled", cost_usd: null, tokens_in: 0, tokens_out: 0 }),
    ]);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f",
    severity: "CRITICAL",
    category: "security",
    title: "A finding",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Why it matters.",
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

describe("RunHistory — severity chips (server/specs/02-findings-by-severity.md)", () => {
  const SECURITY = [
    finding({ id: "c1", title: "Hardcoded Stripe secret key in commit" }),
    finding({ id: "c2", title: "Lethal trifecta: untrusted input reaches exfil path" }),
    finding({ id: "w1", severity: "WARNING", title: "Retry-After header omitted on 429" }),
  ];
  const PERF = [finding({ id: "s1", severity: "SUGGESTION", title: "Cache the rate-limit config" })];

  it("a done run with a linked review shows its chips + blockers instead of 'N finding(s)'", () => {
    renderRuns([run({ findings_count: 3, blockers: 2, score: 38 })], new Map([["run-1", SECURITY]]));
    expect(screen.getByLabelText("3 findings: 2 critical, 1 warning")).toBeInTheDocument();
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
    expect(screen.queryByText(/finding\(s\)/)).not.toBeInTheDocument();
  });

  it("hovering a run's chips shows that run's findings only", () => {
    vi.useFakeTimers();
    renderRuns(
      [run({ run_id: "run-1", findings_count: 3, blockers: 2 }), run({ run_id: "run-2", findings_count: 1, blockers: 0 })],
      new Map([
        ["run-1", SECURITY],
        ["run-2", PERF],
      ]),
    );
    fireEvent.mouseEnter(screen.getByLabelText("1 finding: 1 suggestion"));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Cache the rate-limit config")).toBeInTheDocument();
    expect(within(dialog).queryByText("Hardcoded Stripe secret key in commit")).not.toBeInTheDocument();
  });

  it("a run without a linked review keeps the 'N finding(s)' text", () => {
    renderRuns([run({ findings_count: 2, blockers: 0 })], new Map());
    expect(screen.getByText("2 finding(s)")).toBeInTheDocument();
    expect(screen.queryByLabelText(/findings?:/)).not.toBeInTheDocument();
  });
});
