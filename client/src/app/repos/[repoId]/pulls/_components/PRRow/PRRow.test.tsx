import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

let reviewsData: unknown[] = [];
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (prId: string | null) => ({ data: prId ? reviewsData : undefined }),
}));

import { PRRow } from "./PRRow";

afterEach(() => {
  cleanup();
  push.mockClear();
});

const PR: PrMeta = {
  id: "pr1",
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
  findings_counts: { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 },
};

function renderRow(pr: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={pr} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow findings column", () => {
  it("renders one chip per severity with findings, hiding zero counts", () => {
    renderRow(PR);
    const critical = screen.getByTitle("Show only CRITICAL findings");
    const warning = screen.getByTitle("Show only WARNING findings");
    expect(critical.textContent).toContain("2");
    expect(warning.textContent).toContain("1");
    expect(screen.queryByTitle("Show only SUGGESTION findings")).not.toBeInTheDocument();
  });

  it("navigates to the findings tab filtered by the clicked severity", () => {
    renderRow(PR);
    fireEvent.click(screen.getByTitle("Show only CRITICAL findings"));
    expect(push).toHaveBeenCalledWith("/repos/r1/pulls/482?tab=findings&severity=CRITICAL");
  });

  it("shows a dash when the PR has no review yet", () => {
    renderRow({ ...PR, score: null, findings_counts: null });
    expect(screen.queryByTitle("Show only CRITICAL findings")).not.toBeInTheDocument();
  });

  it("hovering the cell shows a findings preview", () => {
    reviewsData = [
      {
        id: "rv1",
        pr_id: "pr1",
        agent_id: "a1",
        run_id: null,
        kind: "review",
        verdict: "request_changes",
        summary: null,
        score: 61,
        model: null,
        created_at: "2026-08-01T10:00:00Z",
        findings: [
          {
            id: "f1",
            severity: "CRITICAL",
            category: "security",
            title: "Hardcoded Stripe secret key in commit",
            file: "src/config.ts",
            start_line: 12,
            end_line: 12,
            rationale: "Line 12 contains a literal Stripe secret key.",
            suggestion: null,
            confidence: 0.98,
            kind: "finding",
            trifecta_components: null,
            evidence: null,
            review_id: "rv1",
            accepted_at: null,
            dismissed_at: null,
          },
        ],
      },
    ];
    renderRow(PR);
    fireEvent.mouseEnter(screen.getByTitle("Show only CRITICAL findings").parentElement!);
    expect(screen.getByText("1 findings")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("98% conf")).toBeInTheDocument();
    reviewsData = [];
  });
});
