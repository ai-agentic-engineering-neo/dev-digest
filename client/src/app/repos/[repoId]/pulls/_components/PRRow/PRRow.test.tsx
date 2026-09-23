/**
 * PRRow — the COST column shows the latest review's run cost
 * (server/specs/01-run-cost-badge.md); an unreviewed PR reads "—", never "$0.00".
 * The FINDINGS column shows that same review's severity chips and loads the
 * hover popover's findings lazily (server/specs/02-findings-by-severity.md).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";

const { push, usePrReviews } = vi.hoisted(() => ({ push: vi.fn(), usePrReviews: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews }));

import { PRRow } from "./PRRow";

beforeEach(() => {
  push.mockReset();
  usePrReviews.mockReset();
  usePrReviews.mockReturnValue({ data: undefined, isLoading: false, isError: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "a1b2c3d",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: "2026-09-23T09:00:00.000Z",
    updated_at: "2026-09-23T09:00:00.000Z",
    score: null,
    cost_usd: null,
    ...o,
  };
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — COST column", () => {
  it("a reviewed PR shows its latest review's cost", () => {
    renderRow(pr({ status: "reviewed", score: 61, cost_usd: 0.0141 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("an unreviewed PR reads '—' for score, findings and cost, never '$0.00'", () => {
    renderRow(pr({ score: null, cost_usd: null, findings_by_severity: null }));
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
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

function review(o: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "r1",
    pr_id: "pr-1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 61,
    model: "deepseek/deepseek-v4-flash",
    created_at: "2026-09-23T09:00:00.000Z",
    findings: [],
    ...o,
  };
}

describe("PRRow — FINDINGS column", () => {
  const COUNTS = { CRITICAL: 2, WARNING: 2, SUGGESTION: 2 };

  it("a reviewed PR shows the latest review's severity chips", () => {
    renderRow(pr({ status: "reviewed", score: 61, findings_by_severity: COUNTS }));
    expect(screen.getByLabelText("6 findings: 2 critical, 2 warnings, 2 suggestions")).toBeInTheDocument();
  });

  it("a review with no findings reads a muted '0', not '—'", () => {
    renderRow(pr({ status: "reviewed", score: 100, findings_by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } }));
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("loads findings only on hover and shows those of the latest review", () => {
    vi.useFakeTimers();
    usePrReviews.mockImplementation((id: string | null) => ({
      data: id
        ? [
            review({ id: "s", kind: "summary", findings: [finding({ id: "x", title: "From a summary" })] }),
            review({ id: "new", findings: [finding({ id: "n1", title: "Hardcoded Stripe secret key in commit" })] }),
            review({ id: "old", findings: [finding({ id: "o1", title: "From an older review" })] }),
          ]
        : undefined,
      isLoading: false,
      isError: false,
    }));
    renderRow(pr({ status: "reviewed", score: 61, findings_by_severity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 } }));
    expect(usePrReviews).toHaveBeenLastCalledWith(null);

    fireEvent.mouseEnter(screen.getByLabelText("1 finding: 1 critical"));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(usePrReviews).toHaveBeenLastCalledWith("pr-1");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(within(dialog).queryByText("From an older review")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("From a summary")).not.toBeInTheDocument();
  });

  it("a click inside the popover does not open the PR; a click on the row does", () => {
    vi.useFakeTimers();
    usePrReviews.mockReturnValue({
      data: [review({ findings: [finding({ title: "Hardcoded Stripe secret key in commit" })] })],
      isLoading: false,
      isError: false,
    });
    renderRow(pr({ status: "reviewed", score: 61, findings_by_severity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 } }));
    fireEvent.mouseEnter(screen.getByLabelText("1 finding: 1 critical"));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.click(screen.getByText("Hardcoded Stripe secret key in commit"));
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Add rate limiting to public API endpoints"));
    expect(push).toHaveBeenCalledWith("/repos/repo-1/pulls/482");
  });
});
