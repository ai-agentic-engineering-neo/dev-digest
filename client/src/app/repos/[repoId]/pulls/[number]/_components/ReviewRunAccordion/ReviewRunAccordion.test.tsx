/**
 * ReviewRunAccordion — one row of the "Review runs" section.
 *
 * Guards the four behaviours this component owns and nothing else:
 *   - verdict colour comes from the single VERDICT_META source of truth
 *     (no second, drifting local map);
 *   - a FAILED run (which writes no ReviewRecord at all) still gets a row,
 *     rendered red with its error;
 *   - the chevron is the ONLY expand/collapse control (the header itself is
 *     inert, so clicking a badge/severity chip never toggles the panel);
 *   - the new header severity badge is additive — it neither replaces the
 *     existing "N findings · N blockers" text nor renders visible severity
 *     NAME text (which would collide with the FindingsPanel pill locators
 *     used by e2e flow 08).
 */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { VERDICT_META } from "../VerdictBanner/constants";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(cleanup);

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: Math.random().toString(36),
    severity: "WARNING",
    category: "style",
    title: "A finding",
    file: "f.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    confidence: 0.9,
    review_id: "rv-1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

function review(o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "rv-1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "s",
    score: 42,
    model: null,
    created_at: "2026-06-11T18:44:34.000Z",
    findings: [],
    ...o,
  } as ReviewRecord;
}

function failedRun(o: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: "run-f",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "m",
    status: "failed",
    error: "LLM provider returned 503",
    duration_ms: 12,
    tokens_in: 0,
    tokens_out: 0,
    findings_count: 0,
    grounding: null,
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    cost_usd: null,
    ...o,
  };
}

function renderAccordion(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ReviewRunAccordion — verdict is DERIVED from findings, not the model's self-report", () => {
  it.each([
    ["request_changes", "request changes", [finding({ severity: "CRITICAL" })]],
    ["comment", "comment", [finding({ severity: "WARNING" })]],
    ["approve", "approve", []],
  ] as const)("%s renders VERDICT_META's own colour", (verdict, label, findings) => {
    renderAccordion(
      <ReviewRunAccordion
        row={{ kind: "review", review: review({ findings: [...findings] }) }}
        prId="pr1"
      />,
    );
    expect(screen.getByText(label)).toHaveStyle({ color: VERDICT_META[verdict].c });
  });

  it("model said request_changes but grounding kept 0 findings → green 'approve', not red", () => {
    // The reported bug: header + banner showed red "request changes" over a
    // run with 0 findings and score 100, contradicting the Timeline's "approved".
    renderAccordion(
      <ReviewRunAccordion
        row={{ kind: "review", review: review({ verdict: "request_changes", score: 100, findings: [] }) }}
        prId="pr1"
        defaultOpen
      />,
    );
    expect(screen.queryByText("request changes")).not.toBeInTheDocument();
    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
    expect(screen.getByText("approve")).toHaveStyle({ color: VERDICT_META.approve.c });
    expect(screen.getByTestId("run-score")).toHaveStyle({ color: VERDICT_META.approve.c });
  });

  it("a dismissed CRITICAL no longer drives request_changes", () => {
    renderAccordion(
      <ReviewRunAccordion
        row={{
          kind: "review",
          review: review({
            verdict: "request_changes",
            findings: [finding({ severity: "CRITICAL", dismissed_at: "2026-06-12T00:00:00Z" })],
          }),
        }}
        prId="pr1"
      />,
    );
    expect(screen.getByText("approve")).toBeInTheDocument();
  });

  it("the score reads in the verdict colour, and the run cost is shown", () => {
    renderAccordion(
      <ReviewRunAccordion
        row={{ kind: "review", review: review({ score: 38, findings: [finding({ severity: "CRITICAL" })] }) }}
        prId="pr1"
        costUsd={0.0013}
      />,
    );
    expect(screen.getByTestId("run-score")).toHaveTextContent("38");
    expect(screen.getByTestId("run-score")).toHaveStyle({ color: VERDICT_META.request_changes.c });
    expect(screen.getByText(/\$0\.001/)).toBeInTheDocument();
  });

  it("'comment' is amber (both c AND bg), matching VerdictBanner — not the old gray", () => {
    // The accordion used to carry its own VERDICT_COLOR map where `comment`
    // was amber while VERDICT_META said gray. One source of truth now, amber.
    expect(VERDICT_META.comment.c).toBe("var(--warn)");
    expect(VERDICT_META.comment.bg).toBe("var(--warn-bg)");
  });
});

describe("ReviewRunAccordion — failed-run branch", () => {
  it("renders a red 'Failed' header instead of a verdict badge", () => {
    renderAccordion(<ReviewRunAccordion row={{ kind: "failed", run: failedRun() }} prId="pr1" />);
    const badge = screen.getByText("Failed");
    expect(badge).toHaveStyle({ color: "var(--crit)" });
    expect(screen.queryByText("request changes")).not.toBeInTheDocument();
  });

  it("shows the run's error (in crit red, with a full-text title tooltip) when expanded", () => {
    renderAccordion(
      <ReviewRunAccordion row={{ kind: "failed", run: failedRun() }} prId="pr1" defaultOpen />,
    );
    const err = screen.getByText("LLM provider returned 503");
    expect(err).toHaveStyle({ color: "var(--crit)" });
    expect(err).toHaveAttribute("title", "LLM provider returned 503");
  });

  it("renders no FindingsPanel body for a failed run (there are no findings)", () => {
    renderAccordion(
      <ReviewRunAccordion row={{ kind: "failed", run: failedRun() }} prId="pr1" defaultOpen />,
    );
    expect(screen.queryByText("Hide low confidence")).not.toBeInTheDocument();
  });
});

describe("ReviewRunAccordion — trace button", () => {
  it("renders when hasTrace is true and calls onOpenTrace with the run id", () => {
    const onOpenTrace = vi.fn();
    renderAccordion(
      <ReviewRunAccordion
        row={{ kind: "review", review: review() }}
        prId="pr1"
        hasTrace
        onOpenTrace={onOpenTrace}
      />,
    );
    fireEvent.click(screen.getByLabelText("View agent run trace"));
    expect(onOpenTrace).toHaveBeenCalledWith("run-1");
  });

  it("is a labelled 'trace' button with a hover title, not a bare file icon", () => {
    renderAccordion(
      <ReviewRunAccordion row={{ kind: "review", review: review() }} prId="pr1" hasTrace />,
    );
    const btn = screen.getByLabelText("View agent run trace");
    expect(btn).toHaveTextContent("trace");
    expect(btn).toHaveAttribute("title", "View agent run trace");
    expect(btn.querySelector("svg.lucide-panel-right")).not.toBeNull();
  });

  it("is absent when hasTrace is false", () => {
    renderAccordion(<ReviewRunAccordion row={{ kind: "review", review: review() }} prId="pr1" />);
    expect(screen.queryByLabelText("View agent run trace")).not.toBeInTheDocument();
  });
});

describe("ReviewRunAccordion — only the chevron toggles", () => {
  it("clicking the header (agent name) does NOT expand the panel", () => {
    renderAccordion(
      <ReviewRunAccordion
        row={{ kind: "review", review: review({ findings: [finding({ title: "Body finding" })] }) }}
        prId="pr1"
      />,
    );
    fireEvent.click(screen.getByText("Security Reviewer"));
    expect(screen.queryByText("Body finding")).not.toBeInTheDocument();
  });

  it("clicking the chevron button expands it, and fires onOpen once on closed→open only", () => {
    const onOpen = vi.fn();
    renderAccordion(
      <ReviewRunAccordion
        row={{ kind: "review", review: review({ findings: [finding({ title: "Body finding" })] }) }}
        prId="pr1"
        onOpen={onOpen}
      />,
    );
    const chevron = screen.getByLabelText("Expand this run");
    fireEvent.click(chevron);
    expect(screen.getByText("Body finding")).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("run-1");

    fireEvent.click(screen.getByLabelText("Collapse this run"));
    expect(screen.queryByText("Body finding")).not.toBeInTheDocument();
    expect(onOpen).toHaveBeenCalledTimes(1); // collapse must NOT re-fire it
  });

  it("fires onOpen exactly ONCE per click under StrictMode (the app sets reactStrictMode)", () => {
    // React intentionally double-invokes state updaters in strict mode, so
    // calling onOpen from inside setOpen's updater fired the parent's
    // router.replace() twice per click in dev.
    const onOpen = vi.fn();
    renderAccordion(
      <React.StrictMode>
        <ReviewRunAccordion
          row={{ kind: "review", review: review({ findings: [finding({ title: "Body finding" })] }) }}
          prId="pr1"
          onOpen={onOpen}
        />
      </React.StrictMode>,
    );
    fireEvent.click(screen.getByLabelText("Expand this run"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("ReviewRunAccordion — header severity badge is additive", () => {
  const withFindings = review({
    findings: [
      finding({ id: "c1", severity: "CRITICAL" }),
      finding({ id: "w1", severity: "WARNING" }),
      finding({ id: "d1", severity: "CRITICAL", dismissed_at: "2026-01-01T00:00:00Z" }),
    ],
  });

  it("keeps the existing 'N findings · N blockers' text unchanged (e2e flow 04 asserts on it)", () => {
    renderAccordion(<ReviewRunAccordion row={{ kind: "review", review: withFindings }} prId="pr1" />);
    // 3 total findings (dismissed included), 1 ACTIVE critical blocker.
    expect(screen.getByText(/3 findings · 1 blocker$/)).toBeInTheDocument();
  });

  it("renders the badge in `compact` mode — icon + count only, no severity NAME text", () => {
    // Protects e2e flow 08's `find text "CRITICAL"` locator, which must keep
    // resolving to FindingsPanel's SeverityFilterPills and not this header.
    renderAccordion(<ReviewRunAccordion row={{ kind: "review", review: withFindings }} prId="pr1" />);
    expect(screen.queryByText("CRITICAL")).not.toBeInTheDocument();
    expect(screen.queryByText("WARNING")).not.toBeInTheDocument();
  });

  it("counts only ACTIVE (non-dismissed) findings — one chip per remaining severity", () => {
    renderAccordion(<ReviewRunAccordion row={{ kind: "review", review: withFindings }} prId="pr1" />);
    // 1 active CRITICAL + 1 active WARNING ⇒ 2 chips (the dismissed CRITICAL
    // merges into the same chip, so this also proves it isn't double-counted).
    const chips = screen.getAllByRole("button", { expanded: false });
    expect(chips.filter((b) => b.getAttribute("aria-haspopup") === "true")).toHaveLength(2);
  });

  it("clicking a header chip fires onSeverityClick AND still pins its own popover", () => {
    const onSeverityClick = vi.fn();
    const { container } = renderAccordion(
      <ReviewRunAccordion
        row={{ kind: "review", review: withFindings }}
        prId="pr1"
        onSeverityClick={onSeverityClick}
      />,
    );
    const chip = container.querySelector("button[aria-haspopup]") as HTMLElement;
    fireEvent.click(chip);
    expect(onSeverityClick).toHaveBeenCalledWith("CRITICAL");
    // "already at the Review-runs section" ⇒ the local popover stays useful.
    expect(screen.getByText(/FINDINGS IN THIS RUN/)).toBeInTheDocument();
  });
});

describe("ReviewRunAccordion — deep-linked severity", () => {
  it("forwards initialSeverity into FindingsPanel, pre-filtering the card list", () => {
    renderAccordion(
      <ReviewRunAccordion
        row={{
          kind: "review",
          review: review({
            findings: [
              finding({ id: "c1", severity: "CRITICAL", title: "Crit card" }),
              finding({ id: "w1", severity: "WARNING", title: "Warn card" }),
            ],
          }),
        }}
        prId="pr1"
        defaultOpen
        initialSeverity="CRITICAL"
      />,
    );
    const body = screen.getByText("Crit card").closest("[data-finding-id]") as HTMLElement;
    expect(within(body).getByText("Crit card")).toBeInTheDocument();
    expect(screen.queryByText("Warn card")).not.toBeInTheDocument();
  });
});
