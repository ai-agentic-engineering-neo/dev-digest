/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
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
    cost_usd: 0.0013,
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
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
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

describe("RunHistory — run cost", () => {
  it("a settled run shows total tokens and cost next to the time", () => {
    renderRuns([run({ status: "done", tokens_in: 9000, tokens_out: 119, cost_usd: 0.0013 })]);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("an unknown cost reads '—', never '$0.00'", () => {
    renderRuns([run({ status: "done", cost_usd: null })]);
    expect(screen.getByText("150 tok")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });

  it("a failed run shows no cost at all", () => {
    renderRuns([run({ status: "failed", error: "429 quota", cost_usd: null, score: null })]);
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});

describe("RunHistory — Timeline severity icons (crit. 16)", () => {
  it("shows read-only severity pills for a run's findings, with no click handler", () => {
    const findingsByRun = new Map([
      ["run-1", [finding({ id: "c1", severity: "CRITICAL" }), finding({ id: "w1", severity: "WARNING" })]],
    ]);
    renderRuns([run({ status: "done", findings_count: 2, blockers: 1 })], findingsByRun);
    // Two non-zero pills (CRITICAL, WARNING) render as counts, both "1".
    expect(screen.getAllByText("1")).toHaveLength(2);
    // Severity pills here are never clickable — only the agent-name link and
    // the trace/delete icon buttons should be actual buttons on this tile.
    const buttons = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(buttons.some((b) => b?.toLowerCase().includes("critical"))).toBe(false);
  });

  it("renders nothing extra when there's no severity breakdown for a run", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
  });
});

describe("RunHistory — Timeline hover popover (крит. 20/21 pattern reused on the Timeline)", () => {
  it("hovering the findings area opens a popover listing ALL of that run's findings, unlimited, scrollable", () => {
    const findingsByRun = new Map([
      [
        "run-1",
        [
          finding({ id: "c1", severity: "CRITICAL", title: "All analytics endpoints are unauthenticated" }),
          finding({ id: "w1", severity: "WARNING", title: "Date-range boundary is inclusive on both ends" }),
          finding({ id: "w2", severity: "WARNING", title: "No tests for AnalyticsService" }),
        ],
      ],
    ]);
    renderRuns([run({ status: "done", findings_count: 3, blockers: 1 })], findingsByRun);
    expect(screen.queryByText("3 FINDINGS IN THIS RUN")).not.toBeInTheDocument();

    const anchor = screen.getByText(/finding\(s\)/).parentElement!;
    fireEvent.mouseEnter(anchor);

    expect(screen.getByText("3 FINDINGS IN THIS RUN")).toBeInTheDocument();
    expect(screen.getByText("All analytics endpoints are unauthenticated")).toBeInTheDocument();
    expect(screen.getByText("Date-range boundary is inclusive on both ends")).toBeInTheDocument();
    expect(screen.getByText("No tests for AnalyticsService")).toBeInTheDocument();
    // Read-only: no Accept/Dismiss or any other button leaks into the popover.
    const buttons = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(buttons.some((b) => b?.toLowerCase().includes("accept") || b?.toLowerCase().includes("dismiss"))).toBe(
      false,
    );
  });

  it("leaving the findings area closes the popover after a short grace period (not instantly)", () => {
    vi.useFakeTimers();
    try {
      const findingsByRun = new Map([["run-1", [finding({ id: "c1" })]]]);
      renderRuns([run({ status: "done", findings_count: 1 })], findingsByRun);
      const anchor = screen.getByText(/finding\(s\)/).parentElement!;
      fireEvent.mouseEnter(anchor);
      fireEvent.mouseLeave(anchor);
      // Still open right after leaving — the popover is a portal, not a DOM
      // child of the tile, so this window is what lets the cursor reach it.
      expect(screen.getByText("1 FINDINGS IN THIS RUN")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(200));
      expect(screen.queryByText("1 FINDINGS IN THIS RUN")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("moving the cursor onto the popover itself (to scroll a long findings list) keeps it open", () => {
    vi.useFakeTimers();
    try {
      const findingsByRun = new Map([["run-1", [finding({ id: "c1" })]]]);
      renderRuns([run({ status: "done", findings_count: 1 })], findingsByRun);
      const anchor = screen.getByText(/finding\(s\)/).parentElement!;
      fireEvent.mouseEnter(anchor);
      fireEvent.mouseLeave(anchor); // cursor in transit toward the popover
      const popover = screen.getByRole("tooltip");
      fireEvent.mouseEnter(popover); // cursor arrives on the popover
      act(() => vi.advanceTimersByTime(500));
      expect(screen.getByText("1 FINDINGS IN THIS RUN")).toBeInTheDocument();

      fireEvent.mouseLeave(popover);
      act(() => vi.advanceTimersByTime(200));
      expect(screen.queryByText("1 FINDINGS IN THIS RUN")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("scrolling the popover's own findings list does NOT close it — this is the bug being fixed", () => {
    const findingsByRun = new Map([["run-1", [finding({ id: "c1" })]]]);
    renderRuns([run({ status: "done", findings_count: 1 })], findingsByRun);
    const anchor = screen.getByText(/finding\(s\)/).parentElement!;
    fireEvent.mouseEnter(anchor);
    const popover = screen.getByRole("tooltip");
    fireEvent.scroll(popover);
    expect(screen.getByText("1 FINDINGS IN THIS RUN")).toBeInTheDocument();
  });

  it("a real page scroll (not inside the popover) still closes it", () => {
    const findingsByRun = new Map([["run-1", [finding({ id: "c1" })]]]);
    renderRuns([run({ status: "done", findings_count: 1 })], findingsByRun);
    const anchor = screen.getByText(/finding\(s\)/).parentElement!;
    fireEvent.mouseEnter(anchor);
    expect(screen.getByText("1 FINDINGS IN THIS RUN")).toBeInTheDocument();
    fireEvent.scroll(document);
    expect(screen.queryByText("1 FINDINGS IN THIS RUN")).not.toBeInTheDocument();
  });

  it("the popover is rendered in document.body (portal), not clipped inside the tile", () => {
    const findingsByRun = new Map([["run-1", [finding({ id: "c1" })]]]);
    const { container } = renderRuns([run({ status: "done", findings_count: 1 })], findingsByRun);
    const anchor = screen.getByText(/finding\(s\)/).parentElement!;
    fireEvent.mouseEnter(anchor);
    const tooltip = screen.getByRole("tooltip");
    expect(container.contains(tooltip)).toBe(false);
    expect(document.body.contains(tooltip)).toBe(true);
  });

  it("a run with no findings shows no popover on hover", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    const anchor = screen.getByText(/finding\(s\)/).parentElement!;
    fireEvent.mouseEnter(anchor);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
