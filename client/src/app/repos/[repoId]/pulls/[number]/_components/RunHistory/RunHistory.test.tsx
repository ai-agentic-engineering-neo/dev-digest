/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, ReviewRecord, PrCommit } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";
import { GO_TO_REVIEW_CLASS, css } from "./styles";

// Resolves, like the real API: the ✓ is now gated on the write succeeding.
const writeText = vi.fn((_text: string) => Promise.resolve());
beforeAll(() => {
  // jsdom ships no navigator.clipboard at all — define it once, the same way
  // the copy-to-clipboard path in vendor/ui/LiveLogStream.tsx expects it
  // (that call site uses optional chaining, so a missing API is a silent no-op
  // and a test that forgets this mock would pass vacuously).
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  writeText.mockClear();
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
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    cost_usd: null,
    ...o,
  };
}

function review(o: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rv-1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 0,
    model: null,
    created_at: "2026-06-11T18:44:34.000Z",
    findings: [],
    ...o,
  };
}

function finding(severity: "CRITICAL" | "WARNING" | "SUGGESTION", id: string, reviewId: string) {
  return {
    id,
    severity,
    category: "security" as const,
    title: `${severity} ${id}`,
    file: "f.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    confidence: 0.9,
    review_id: reviewId,
    accepted_at: null,
    dismissed_at: null,
  };
}

function renderRuns(
  runs: RunSummary[],
  reviews?: ReviewRecord[],
  extra: Partial<React.ComponentProps<typeof RunHistory>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} reviews={reviews} onOpenTrace={() => {}} {...extra} />
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
  it("shows tokens and cost for a settled run", () => {
    renderRuns([run({ status: "done", tokens_in: 9000, tokens_out: 119, cost_usd: 0.0013 })]);
    expect(screen.getByText(/9,119 tok/)).toBeInTheDocument();
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });

  it("shows — for a done run with no cost data (legacy row)", () => {
    renderRuns([run({ status: "done", cost_usd: null })]);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("RunHistory — per-run severity badge (scoped to just that run)", () => {
  it("a run with a matching review shows that run's own severity counts, not another run's", () => {
    const runs = [
      run({ run_id: "run-A", agent_name: "Security Reviewer" }),
      run({ run_id: "run-B", agent_name: "Performance Reviewer" }),
    ];
    const reviews = [
      review({
        run_id: "run-A",
        findings: [finding("CRITICAL", "a1", "rv-A"), finding("WARNING", "a2", "rv-A")],
      }),
      review({ id: "rv-B", run_id: "run-B", findings: [finding("SUGGESTION", "b1", "rv-B")] }),
    ];
    const { container } = renderRuns(runs, reviews);
    // Old plain-text findings/blockers line is gone once a matching review exists.
    expect(screen.queryByText(/finding\(s\)/)).not.toBeInTheDocument();
    // run-A's badge has 2 chips (CRITICAL+WARNING); run-B's has 1 (SUGGESTION
    // only) — 3 chip buttons total, none showing the other run's severities.
    expect(container.querySelectorAll("button[aria-haspopup]")).toHaveLength(3);
    expect(screen.queryByTestId("findings-badge-empty")).not.toBeInTheDocument();
  });

  it("falls back to the old plain-text counts when no matching review exists (legacy row)", () => {
    renderRuns([run({ run_id: "run-legacy", findings_count: 2, blockers: 1 })], []);
    expect(screen.getByText(/2 finding\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 blockers/)).toBeInTheDocument();
  });

  it("excludes dismissed findings from the per-run badge count", () => {
    const dismissed = { ...finding("CRITICAL", "d1", "rv-1"), dismissed_at: "2026-01-01T00:00:00Z" };
    const { container } = renderRuns(
      [run({ run_id: "run-1" })],
      [review({ run_id: "run-1", findings: [dismissed, finding("WARNING", "w1", "rv-1")] })],
    );
    // Only the active WARNING finding should produce a chip — the dismissed
    // CRITICAL must not (this is the popover surface, which excludes
    // dismissed findings — the opposite rule from Phase A's accordion pills).
    expect(container.querySelectorAll("button[aria-haspopup]")).toHaveLength(1);
  });

  it("never matches a 'summary'-kind record to a run, even when it shares the run_id", () => {
    // Same defensive `kind === "review"` filter PRRow and FindingsTab apply: a
    // summary row's findings must not drive this run's badge/blockers. With
    // only a summary present, the row falls back to its plain-text counts.
    renderRuns(
      [run({ run_id: "run-1", findings_count: 2, blockers: 1 })],
      [
        review({
          id: "rv-sum",
          run_id: "run-1",
          kind: "summary",
          findings: [finding("CRITICAL", "s1", "rv-sum"), finding("WARNING", "s2", "rv-sum")],
        }),
      ],
    );
    expect(screen.getByText(/2 finding\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 blockers/)).toBeInTheDocument();
  });
});

describe("RunHistory — live blockers (colour and text can never disagree)", () => {
  it("a run whose frozen blockers=5 but whose review has NO active CRITICAL reads 'reviewed', not 'rejected'", () => {
    // The frozen run.blockers column is gate-dependent and set once at
    // completion; the matched review is the live truth. This is the exact
    // divergence the live recount exists to kill.
    renderRuns(
      [run({ run_id: "run-1", status: "done", findings_count: 3, blockers: 5, score: 70 })],
      [review({ run_id: "run-1", findings: [finding("WARNING", "w1", "rv-1")] })],
    );
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText("rejected")).not.toBeInTheDocument();
  });

  it("a DISMISSED critical no longer counts as a blocker (frozen column said it did)", () => {
    const dismissed = { ...finding("CRITICAL", "d1", "rv-1"), dismissed_at: "2026-01-01T00:00:00Z" };
    renderRuns(
      [run({ run_id: "run-1", status: "done", findings_count: 1, blockers: 1, score: 40 })],
      [
        review({
          run_id: "run-1",
          findings: [dismissed, finding("WARNING", "w1", "rv-1")],
        }),
      ],
    );
    // One active (non-blocking) finding is left, so it reads "reviewed" — but
    // not the red "rejected" the frozen blockers=1 column would have produced.
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText("rejected")).not.toBeInTheDocument();
  });

  it("a settled run whose findings were ALL dismissed reads 'approved', not amber 'reviewed'", () => {
    // The frozen findings_count still says 2; the matched review says every one
    // of them is dismissed, which is also what the (empty) severity badge on
    // this very row shows. The colour must not contradict its own badge.
    const dismissed = (sev: "CRITICAL" | "WARNING", id: string) => ({
      ...finding(sev, id, "rv-1"),
      dismissed_at: "2026-01-01T00:00:00Z",
    });
    const { container } = renderRuns(
      [run({ run_id: "run-1", status: "done", findings_count: 2, blockers: 1, score: 40 })],
      [review({ run_id: "run-1", findings: [dismissed("CRITICAL", "d1"), dismissed("WARNING", "d2")] })],
    );
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.queryByText("reviewed")).not.toBeInTheDocument();
    // …and the badge beside it is the empty "—" one, as the outcome now claims.
    expect(screen.getByTestId("findings-badge-empty")).toBeInTheDocument();
    // The score ring follows the (green) outcome, never amber/red.
    const strokes = [...container.querySelectorAll("circle")].map((c) => c.getAttribute("stroke"));
    expect(strokes).toContain("var(--ok)");
  });

  it("with no matching review the 'reviewed' branch still falls back to the frozen count", () => {
    renderRuns([run({ run_id: "run-legacy", status: "done", findings_count: 3, blockers: 0 })], []);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
  });

  it("an ACTIVE critical in the matched review reads 'rejected' even when the frozen column is 0", () => {
    renderRuns(
      [run({ run_id: "run-1", status: "done", findings_count: 1, blockers: 0, score: 40 })],
      [review({ run_id: "run-1", findings: [finding("CRITICAL", "c1", "rv-1")] })],
    );
    expect(screen.getByText("rejected")).toBeInTheDocument();
  });

  it("with no matching review, the outcome label AND the printed text both fall back to run.blockers together", () => {
    renderRuns([run({ run_id: "run-legacy", status: "done", findings_count: 4, blockers: 2 })], []);
    // Same single value drives both — a red badge always has blocker text.
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
  });

  it("the score ring colour follows the row's outcome badge, not the numeric threshold", () => {
    const { container } = renderRuns([
      run({ status: "done", findings_count: 5, blockers: 5, score: 92 }),
    ]);
    // 92 would be green on the numeric threshold; the row is "rejected", so
    // the ring must be red instead.
    const strokes = [...container.querySelectorAll("circle")].map((c) => c.getAttribute("stroke"));
    expect(strokes).toContain("var(--crit)");
    expect(strokes).not.toContain("var(--ok)");
  });
});

describe("RunHistory — commit rows", () => {
  const commit: PrCommit = {
    sha: "abcdef1234567",
    message: "feat: add rate limiting\n\nbody",
    author: "marisa.koch",
    committed_at: "2026-06-11T18:00:00.000Z",
  } as PrCommit;

  it("renders the commit icon + sha in accent blue, and keeps the message muted for hierarchy", () => {
    renderRuns([], [], { commits: [commit] });
    const sha = screen.getByText("abcdef1");
    expect(sha).toHaveStyle({ color: "var(--accent)" });
    expect(screen.getByText("feat: add rate limiting")).toHaveStyle({
      color: "var(--text-secondary)",
    });
  });
});

describe("RunHistory — 'go to review' link styling", () => {
  it("defaults to text-primary with no underline, and turns accent on :hover via a real CSS rule", () => {
    renderRuns([run({ agent_name: "Security Reviewer" })], [], { onGoToReview: () => {} });
    const link = screen.getByText("Security Reviewer");
    expect(link).toHaveClass(GO_TO_REVIEW_CLASS);
    // No inline text-decoration/colour any more — both live in the CSS rule
    // (there is no onMouseEnter/onMouseLeave precedent in this component).
    expect(link.style.textDecoration).toBe("");
    expect(css).toContain(`.${GO_TO_REVIEW_CLASS} { color: var(--text-primary); text-decoration: none; }`);
    expect(css).toContain(`.${GO_TO_REVIEW_CLASS}:hover { color: var(--accent); text-decoration: none; }`);
  });
});

describe("RunHistory — Timeline severity chip navigates (and does NOT pin its own popover)", () => {
  it("clicking a chip calls onGoToReview(runId, severity)", () => {
    const onGoToReview = vi.fn();
    const { container } = renderRuns(
      [run({ run_id: "run-1" })],
      [review({ run_id: "run-1", findings: [finding("CRITICAL", "c1", "rv-1")] })],
      { onGoToReview },
    );
    fireEvent.click(container.querySelector("button[aria-haspopup]")!);
    expect(onGoToReview).toHaveBeenCalledWith("run-1", "CRITICAL");
    // The page is about to be left — pinning a popover here would be pointless.
    expect(screen.queryByText(/FINDINGS IN THIS RUN/)).not.toBeInTheDocument();
  });
});

describe("RunHistory — copy shareable run link", () => {
  it("writes a URL built via new URL()/searchParams, and swaps the icon to a check", async () => {
    const { container } = renderRuns([run({ run_id: "run-1" })], [], { repoId: "r1", prNumber: 482 });
    const copyBtn = screen.getByLabelText("Copy a shareable link to this run");
    fireEvent.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/repos/r1/pulls/482?tab=findings&agent=run-1`,
    );
    // The ✓ only appears once the write RESOLVES (one microtask later).
    await waitFor(() => expect(container.querySelector("svg.lucide-check")).toBeInTheDocument());
  });

  it("shows NO success indicator when the clipboard write rejects", async () => {
    writeText.mockImplementationOnce(() => Promise.reject(new Error("denied")));
    const { container } = renderRuns([run({ run_id: "run-1" })], [], { repoId: "r1", prNumber: 482 });
    fireEvent.click(screen.getByLabelText("Copy a shareable link to this run"));
    await Promise.resolve();
    expect(container.querySelector("svg.lucide-check")).toBeNull();
    expect(container.querySelector("svg.lucide-copy")).toBeInTheDocument();
  });

  it("shows NO success indicator when navigator.clipboard is unavailable entirely", async () => {
    // Non-HTTPS / non-localhost contexts ship no `navigator.clipboard` at all.
    const original = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    try {
      const { container } = renderRuns([run({ run_id: "run-1" })], [], { repoId: "r1", prNumber: 482 });
      fireEvent.click(screen.getByLabelText("Copy a shareable link to this run"));
      await Promise.resolve();
      expect(container.querySelector("svg.lucide-check")).toBeNull();
      expect(container.querySelector("svg.lucide-copy")).toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, "clipboard", { value: original, configurable: true });
    }
  });

  it("escapes a repoId containing URL-significant characters instead of splicing it raw", async () => {
    const { container } = renderRuns([run({ run_id: "run-1" })], [], { repoId: "a&b c", prNumber: 482 });
    fireEvent.click(screen.getByLabelText("Copy a shareable link to this run"));
    await waitFor(() => expect(container.querySelector("svg.lucide-check")).toBeInTheDocument());
    const written = writeText.mock.calls[0]![0] as string;
    expect(written).toContain("/repos/a&b%20c/pulls/482");
    expect(written).toContain("tab=findings");
    expect(written).toContain("agent=run-1");
  });

  it("renders no copy button at all when the route identity wasn't threaded down", () => {
    renderRuns([run({ run_id: "run-1" })]);
    expect(screen.queryByLabelText("Copy a shareable link to this run")).not.toBeInTheDocument();
  });
});

describe("RunHistory — trace button gating on has_trace", () => {
  it("is hidden for a SETTLED run that never wrote a trace document", () => {
    renderRuns([run({ status: "done", has_trace: false })]);
    expect(screen.queryByLabelText("Open run trace & logs")).not.toBeInTheDocument();
  });

  it("stays visible while a run is still RUNNING (its trace isn't written yet)", () => {
    renderRuns([run({ status: "running", has_trace: false, score: null, blockers: null })]);
    expect(screen.getByLabelText("Open run trace & logs")).toBeInTheDocument();
  });

  it("stays visible when has_trace is absent entirely (legacy row / old fixture)", () => {
    renderRuns([run({ status: "done" })]);
    expect(screen.getByLabelText("Open run trace & logs")).toBeInTheDocument();
  });

  it("is visible for a settled run that DID write a trace", () => {
    renderRuns([run({ status: "done", has_trace: true })]);
    expect(screen.getByLabelText("Open run trace & logs")).toBeInTheDocument();
  });
});
