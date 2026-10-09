import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import prReview from "../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../messages/en/common.json";
import { PRRow } from "./PRRow";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// Lazy finding previews: the hook only receives the PR id once the popover opens.
const usePrReviews = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews: (id: string | null) => usePrReviews(id) }));

beforeEach(() => {
  usePrReviews.mockImplementation(() => ({ data: undefined, isLoading: false }));
});
afterEach(() => {
  cleanup();
  push.mockReset();
  usePrReviews.mockReset();
});

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "a1b2c3",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: null,
    updated_at: null,
    score: 61,
    cost_usd: null,
    severity_counts: null,
    ...o,
  };
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, common }}>
      <PRRow pr={p} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost column", () => {
  it("shows the PR's total run cost", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows a dash when the PR has no known cost", () => {
    renderRow(pr({ cost_usd: null, score: 61 }));
    expect(screen.getByLabelText("Cost unknown")).toHaveTextContent("—");
  });
});

describe("PRRow — findings column", () => {
  const findingRecord = (id: string, severity: "CRITICAL" | "WARNING", title: string) => ({
    id,
    severity,
    category: "security" as const,
    title,
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Details.",
    suggestion: null,
    confidence: 0.98,
    kind: "finding" as const,
    trifecta_components: null,
    evidence: null,
    review_id: "r-new",
    accepted_at: null,
    dismissed_at: null,
  });
  const review = (
    id: string,
    agent_id: string,
    created_at: string,
    findings: ReturnType<typeof findingRecord>[],
  ) => ({
    id,
    pr_id: "pr-1",
    agent_id,
    run_id: null,
    kind: "review" as const,
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at,
    findings,
  });

  it("shows the latest run's counts per severity", () => {
    renderRow(pr({ severity_counts: { CRITICAL: 1, WARNING: 1, SUGGESTION: 0 } }));
    expect(screen.getByLabelText("1 Critical")).toBeInTheDocument();
    expect(screen.getByLabelText("1 Warning")).toBeInTheDocument();
    expect(usePrReviews).toHaveBeenLastCalledWith(null); // nothing fetched before hover
  });

  it("hover lazily loads the latest review of each agent, read-only", () => {
    usePrReviews.mockImplementation((id: string | null) => ({
      data: id
        ? [
            review("sec-old", "sec", "2026-01-01T00:00:00Z", [findingRecord("old", "WARNING", "Old finding")]),
            review("sec-new", "sec", "2026-02-01T00:00:00Z", [
              findingRecord("b", "CRITICAL", "Hardcoded Stripe secret key in commit"),
            ]),
            review("gen", "gen", "2026-02-01T00:00:01Z", [
              findingRecord("a", "WARNING", "N+1 query in user list endpoint"),
            ]),
            review("perf", "perf", "2026-02-01T00:00:02Z", []),
          ]
        : undefined,
      isLoading: false,
    }));
    renderRow(pr({ severity_counts: { CRITICAL: 1, WARNING: 1, SUGGESTION: 0 } }));
    fireEvent.mouseEnter(screen.getByLabelText("1 Critical"));
    expect(usePrReviews).toHaveBeenLastCalledWith("pr-1");
    const dialog = screen.getByRole("dialog", { name: "2 findings in this run" });
    expect(within(dialog).getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(within(dialog).getByText("N+1 query in user list endpoint")).toBeInTheDocument();
    expect(within(dialog).queryByText("Old finding")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByText("Hardcoded Stripe secret key in commit"));
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a dash and no popover for an unreviewed PR", () => {
    renderRow(pr({ score: null, severity_counts: null }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
