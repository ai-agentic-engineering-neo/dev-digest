/**
 * PRRow — the COST column. A PR whose latest completed run has a known cost
 * shows it; a PR that was never reviewed (or whose model has no price) shows
 * "—". "$0.00" on an unpriced PR would read as "this review was free".
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { PRRow } from "./PRRow";

afterEach(() => {
  cleanup();
  push.mockClear();
});

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "e694ac8",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: "2026-06-13T15:00:00.000Z",
    updated_at: "2026-06-13T18:00:00.000Z",
    score: 61,
    cost_usd: 0.014,
    findings_by_severity: null,
    findings_preview: null,
    ...o,
  };
}

function renderRow(meta: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={meta} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost column", () => {
  it("shows the latest completed run's cost", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows '—' when no run has a known cost", () => {
    renderRow(pr({ cost_usd: null, score: null }));
    // Both the score ring and the cost fall back to "—" on an unreviewed PR.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("shows '$0.00' for a genuinely free model", () => {
    renderRow(pr({ cost_usd: 0 }));
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });
});

describe("PRRow — FINDINGS column (crit. 16, 20, 21)", () => {
  const FINDINGS_BY_SEVERITY = { CRITICAL: 1, WARNING: 1, SUGGESTION: 0 };
  const FINDINGS_PREVIEW = [
    {
      id: "f1",
      severity: "CRITICAL" as const,
      category: "security" as const,
      title: "Hardcoded Stripe secret key in commit",
      file: "src/config.ts",
      start_line: 12,
      end_line: 12,
      rationale: "Line 12 contains a literal string starting with sk_live_.",
      suggestion: null,
      confidence: 0.98,
      kind: "finding" as const,
      trifecta_components: null,
      evidence: null,
    },
    {
      id: "f2",
      severity: "WARNING" as const,
      category: "perf" as const,
      title: "N+1 query in user list endpoint",
      file: "src/api/users.ts",
      start_line: 45,
      end_line: 52,
      rationale: "The loop on line 46 calls db.posts.findMany once per user.",
      suggestion: null,
      confidence: 0.86,
      kind: "finding" as const,
      trifecta_components: null,
      evidence: null,
    },
  ];

  it("shows '—' when the PR has never been reviewed", () => {
    renderRow(pr({ findings_by_severity: null, findings_preview: null }));
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("shows severity icons with counts when the latest review has findings", () => {
    renderRow(
      pr({ findings_by_severity: FINDINGS_BY_SEVERITY, findings_preview: FINDINGS_PREVIEW }),
    );
    // One CRITICAL pill (1) and one WARNING pill (1); SUGGESTION is 0 → not rendered.
    expect(screen.getAllByText("1")).toHaveLength(2);
  });

  it("clicking a severity icon navigates to the filtered PR-detail view, not the row's own link", () => {
    renderRow(
      pr({ findings_by_severity: FINDINGS_BY_SEVERITY, findings_preview: FINDINGS_PREVIEW }),
    );
    fireEvent.click(screen.getByLabelText("Show only Critical findings"));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/repos/repo-1/pulls/482?tab=findings&severity=CRITICAL");
  });

  it("the popover is closed by default and opens on hover, titled 'N FINDINGS IN THIS RUN', read-only", () => {
    renderRow(
      pr({ findings_by_severity: FINDINGS_BY_SEVERITY, findings_preview: FINDINGS_PREVIEW }),
    );
    expect(screen.queryByText("2 FINDINGS IN THIS RUN")).not.toBeInTheDocument();
    const cell = screen.getByLabelText("Show only Critical findings").closest("div")!.parentElement!;
    fireEvent.mouseEnter(cell);
    expect(screen.getByText("2 FINDINGS IN THIS RUN")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
    // Only the two severity-icon buttons exist — none inside the popover.
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("leaving the cell closes the popover after a short grace period (not instantly)", () => {
    vi.useFakeTimers();
    try {
      renderRow(
        pr({ findings_by_severity: FINDINGS_BY_SEVERITY, findings_preview: FINDINGS_PREVIEW }),
      );
      const cell = screen.getByLabelText("Show only Critical findings").closest("div")!.parentElement!;
      fireEvent.mouseEnter(cell);
      fireEvent.mouseLeave(cell);
      // Still open immediately after leaving — the popover is a portal, not a
      // DOM child, so this window is what lets the cursor reach it.
      expect(screen.getByText("2 FINDINGS IN THIS RUN")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(200));
      expect(screen.queryByText("2 FINDINGS IN THIS RUN")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("moving the cursor onto the popover itself (to scroll it) keeps it open — this is the bug being fixed", () => {
    vi.useFakeTimers();
    try {
      renderRow(
        pr({ findings_by_severity: FINDINGS_BY_SEVERITY, findings_preview: FINDINGS_PREVIEW }),
      );
      const cell = screen.getByLabelText("Show only Critical findings").closest("div")!.parentElement!;
      fireEvent.mouseEnter(cell);
      fireEvent.mouseLeave(cell); // cursor is in transit toward the popover
      const popover = screen.getByRole("tooltip");
      fireEvent.mouseEnter(popover); // cursor arrives on the popover
      act(() => vi.advanceTimersByTime(500)); // well past the grace period
      expect(screen.getByText("2 FINDINGS IN THIS RUN")).toBeInTheDocument();

      // Leaving the popover (not back onto the cell) does eventually close it.
      fireEvent.mouseLeave(popover);
      act(() => vi.advanceTimersByTime(200));
      expect(screen.queryByText("2 FINDINGS IN THIS RUN")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the popover accepts mouse interaction (not pointer-events: none) so wheel-scroll works", () => {
    renderRow(
      pr({ findings_by_severity: FINDINGS_BY_SEVERITY, findings_preview: FINDINGS_PREVIEW }),
    );
    const cell = screen.getByLabelText("Show only Critical findings").closest("div")!.parentElement!;
    fireEvent.mouseEnter(cell);
    const popover = screen.getByRole("tooltip");
    expect(popover.style.pointerEvents).not.toBe("none");
  });

  it("scrolling the popover's own findings list does NOT close it — this is the bug being fixed", () => {
    renderRow(
      pr({ findings_by_severity: FINDINGS_BY_SEVERITY, findings_preview: FINDINGS_PREVIEW }),
    );
    const cell = screen.getByLabelText("Show only Critical findings").closest("div")!.parentElement!;
    fireEvent.mouseEnter(cell);
    const popover = screen.getByRole("tooltip");
    // `scroll` doesn't bubble, but a `capture: true` window listener still
    // sees it fire on this element during the capture phase — that's exactly
    // what previously misread "the popover scrolled" as "the page scrolled"
    // and closed it on every wheel tick.
    fireEvent.scroll(popover);
    expect(screen.getByText("2 FINDINGS IN THIS RUN")).toBeInTheDocument();
  });

  it("a real page scroll (not inside the popover) still closes it", () => {
    renderRow(
      pr({ findings_by_severity: FINDINGS_BY_SEVERITY, findings_preview: FINDINGS_PREVIEW }),
    );
    const cell = screen.getByLabelText("Show only Critical findings").closest("div")!.parentElement!;
    fireEvent.mouseEnter(cell);
    expect(screen.getByText("2 FINDINGS IN THIS RUN")).toBeInTheDocument();
    fireEvent.scroll(document);
    expect(screen.queryByText("2 FINDINGS IN THIS RUN")).not.toBeInTheDocument();
  });
});
