/** PRRow — the COST column must show "—" for an unpriced/never-reviewed PR
 *  and a formatted dollar figure once the latest completed run has a cost. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({
    data: [
      {
        id: "r1",
        findings: [
          {
            id: "f1",
            severity: "CRITICAL",
            category: "security",
            title: "All analytics endpoints are unauthenticated",
            file: "src/router.ts",
            start_line: 19,
            end_line: 55,
            rationale: "Every procedure is publicProcedure.",
            confidence: 0.95,
          },
        ],
      },
    ],
  }),
}));

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "abc123",
    additions: 200,
    deletions: 30,
    files_count: 5,
    status: "needs_review",
    opened_at: "2026-06-11T18:00:00.000Z",
    updated_at: "2026-06-11T18:44:34.000Z",
    score: null,
    cost_usd: null,
    ...o,
  };
}

function renderRow(row: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={row} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow", () => {
  it("shows an em dash when the PR has no completed run yet", () => {
    // score + findings set so the only "—" on the row is the cost cell's.
    renderRow(pr({ score: 80, cost_usd: null, findings: { critical: 1, warning: 0, suggestion: 0 } }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the formatted cost of the latest completed run", () => {
    renderRow(pr({ score: 80, cost_usd: 0.014, findings: { critical: 1, warning: 0, suggestion: 0 } }));
    expect(screen.getByText("$0.0140")).toBeInTheDocument();
  });
});

describe("PRRow — FINDINGS column", () => {
  it("shows an em dash when the PR has no findings yet", () => {
    renderRow(pr({ findings: null, score: 80, cost_usd: 0.01 }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a severity badge with the correct count per present severity", () => {
    renderRow(pr({ findings: { critical: 1, warning: 3, suggestion: 0 } }));
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("hovering the severity icons opens a read-only popover titled 'N FINDING(S) IN THIS RUN'", () => {
    renderRow(pr({ findings: { critical: 1, warning: 0, suggestion: 0 } }));
    expect(screen.queryByText("1 FINDING(S) IN THIS RUN")).not.toBeInTheDocument();

    const [badgeCount] = screen.getAllByText("1");
    fireEvent.mouseEnter(badgeCount!.closest("div[style*='inline-block']")!);

    expect(screen.getByText("1 FINDING(S) IN THIS RUN")).toBeInTheDocument();
    expect(screen.getByText("All analytics endpoints are unauthenticated")).toBeInTheDocument();
    // Read-only: no Accept/Reject/Dismiss buttons in the popover.
    expect(screen.queryByRole("button", { name: /accept|dismiss|reject/i })).not.toBeInTheDocument();
  });
});
