/** PRRow — the COST column shows the PR's summed run cost, or "—" when unknown;
 *  the FINDINGS column shows per-severity counters with a lazily-loaded popover. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const usePrReviews = vi.fn((prId: string | null) => ({
  data: prId
    ? [
        {
          findings: [
            {
              id: "f1",
              severity: "CRITICAL",
              category: "security",
              title: "Hardcoded Stripe secret key in commit",
              file: "src/config.ts",
              start_line: 12,
              end_line: 12,
              rationale: "Line 12 contains a literal secret.",
              suggestion: null,
              confidence: 0.98,
              kind: "finding",
              review_id: "r1",
              accepted_at: null,
              dismissed_at: null,
            },
          ],
        },
      ]
    : undefined,
  isLoading: false,
}));
vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews: (id: string | null) => usePrReviews(id) }));

afterEach(cleanup);

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
    opened_at: null,
    updated_at: null,
    score: 61,
    cost_usd: null,
    finding_counts: null,
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

describe("PRRow — COST column (L01)", () => {
  it("shows the summed run cost", () => {
    renderRow(pr({ cost_usd: 0.0142 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows '—' for a PR without priced runs", () => {
    renderRow(pr({ cost_usd: null, score: null }));
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });
});

describe("PRRow — FINDINGS column", () => {
  it("shows a counter per non-zero severity and '—' when there are none", () => {
    renderRow(pr({ finding_counts: { CRITICAL: 2, WARNING: 0, SUGGESTION: 4 }, cost_usd: 0.01 }));
    expect(screen.getByLabelText("2 Critical findings")).toBeInTheDocument();
    expect(screen.getByLabelText("4 Suggestion findings")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Warning findings/)).not.toBeInTheDocument();
  });

  it("fetches findings only when the popover opens, then lists them", () => {
    usePrReviews.mockClear();
    renderRow(pr({ finding_counts: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 } }));
    expect(usePrReviews).not.toHaveBeenCalledWith("pr-1");
    fireEvent.mouseEnter(screen.getByLabelText("1 Critical findings"));
    expect(usePrReviews).toHaveBeenCalledWith("pr-1");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Hardcoded Stripe secret key in commit");
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
  });
});
