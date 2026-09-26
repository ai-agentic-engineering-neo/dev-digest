/**
 * PRRow — the FINDINGS column. What is worth pinning here is not that chips
 * render, but the two rules that are easy to undo later: the chips are NOT
 * links (the row click still navigates to the PR), and "—" means two different
 * things that must both stay quiet.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "@messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const usePrReviews = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (prId: string | null) => usePrReviews(prId),
}));

import { PRRow } from "./PRRow";

afterEach(() => {
  cleanup();
  push.mockReset();
  vi.useRealTimers();
});

const pr = (over: Partial<PrMeta> = {}): PrMeta =>
  ({
    id: "pr1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rl",
    base: "main",
    head_sha: "deadbeef",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: null,
    updated_at: null,
    score: 61,
    cost_usd: 0.014,
    findings_by_severity: { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 },
    ...over,
  }) as PrMeta;

function renderRow(meta: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={meta} repoId="repo1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — FINDINGS column", () => {
  it("shows a chip per non-empty severity and hides the empty ones", () => {
    usePrReviews.mockReturnValue({ data: undefined, isLoading: false });
    renderRow(pr());

    expect(screen.getByTitle("2 CRITICAL findings")).toBeInTheDocument();
    expect(screen.getByTitle("1 WARNING findings")).toBeInTheDocument();
    expect(screen.queryByTitle(/SUGGESTION/)).not.toBeInTheDocument();
  });

  it("renders an em dash both for a clean PR and for one never reviewed", () => {
    usePrReviews.mockReturnValue({ data: undefined, isLoading: false });

    renderRow(pr({ findings_by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } }));
    expect(screen.getByTitle("No findings")).toHaveTextContent("—");
    cleanup();

    renderRow(pr({ findings_by_severity: null, score: null }));
    // Never reviewed: same em dash, but without the "No findings" tooltip —
    // the payload keeps "clean" and "unknown" apart even though the cell cannot.
    const cell = screen.getByRole("group", { name: "Findings by severity" });
    expect(cell).toHaveTextContent("—");
    expect(screen.queryByTitle("No findings")).not.toBeInTheDocument();
  });

  it("navigates to the PR when a chip is clicked — chips are not filters", () => {
    usePrReviews.mockReturnValue({ data: undefined, isLoading: false });
    renderRow(pr());

    fireEvent.click(screen.getByTitle("2 CRITICAL findings"));
    expect(push).toHaveBeenCalledWith("/repos/repo1/pulls/482");
  });

  it("opens the preview only after the pointer rests, then keeps the query armed", () => {
    vi.useFakeTimers();
    usePrReviews.mockReturnValue({
      data: [
        {
          id: "rev1",
          run_id: "run1",
          findings: [
            {
              id: "f1",
              severity: "CRITICAL",
              category: "security",
              title: "Hardcoded Stripe secret key in commit",
              file: "src/config.ts",
              start_line: 12,
              end_line: 12,
              rationale: "literal sk_live_ key",
              confidence: 0.98,
            },
          ],
        },
      ],
      isLoading: false,
    });
    renderRow(pr());
    const cell = screen.getByRole("group", { name: "Findings by severity" });

    fireEvent.mouseEnter(cell);
    expect(screen.queryByText("3 findings")).not.toBeInTheDocument();
    expect(usePrReviews).toHaveBeenLastCalledWith(null); // nothing fetched yet

    act(() => void vi.advanceTimersByTime(200));
    expect(screen.getByText("3 findings")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(usePrReviews).toHaveBeenLastCalledWith("pr1");

    fireEvent.mouseLeave(cell);
    expect(screen.queryByText("3 findings")).not.toBeInTheDocument();
    // The query stays armed so a second hover comes straight from the cache.
    expect(usePrReviews).toHaveBeenLastCalledWith("pr1");
  });

  it("previews only each agent's latest review — the ones the chips count", () => {
    vi.useFakeTimers();
    const finding = (id: string, title: string) => ({
      id,
      severity: "CRITICAL",
      category: "security",
      title,
      file: "src/config.ts",
      start_line: 1,
      end_line: 1,
      rationale: "r",
      confidence: 0.9,
    });
    usePrReviews.mockReturnValue({
      data: [
        {
          id: "gen-old",
          agent_id: "gen",
          created_at: "2026-01-01T10:00:00Z",
          findings: [finding("f1", "Stale finding from an older run")],
        },
        {
          id: "gen-new",
          agent_id: "gen",
          created_at: "2026-01-02T10:00:00Z",
          findings: [finding("f2", "Fresh finding from the latest run")],
        },
        {
          id: "tq",
          agent_id: "tq",
          created_at: "2026-01-01T12:00:00Z",
          findings: [finding("f3", "Finding from the other agent")],
        },
      ],
      isLoading: false,
    });
    renderRow(pr());

    fireEvent.mouseEnter(screen.getByRole("group", { name: "Findings by severity" }));
    act(() => void vi.advanceTimersByTime(200));

    expect(screen.getByText("Fresh finding from the latest run")).toBeInTheDocument();
    expect(screen.getByText("Finding from the other agent")).toBeInTheDocument();
    expect(screen.queryByText("Stale finding from an older run")).not.toBeInTheDocument();
  });

  it("never opens a preview for a PR with nothing to preview", () => {
    vi.useFakeTimers();
    usePrReviews.mockReturnValue({ data: undefined, isLoading: false });
    renderRow(pr({ findings_by_severity: null, score: null }));

    fireEvent.mouseEnter(screen.getByRole("group", { name: "Findings by severity" }));
    act(() => void vi.advanceTimersByTime(200));
    expect(usePrReviews).toHaveBeenLastCalledWith(null);
  });
});
