/**
 * PRRow — the list's COST column reads the total cost the server computed
 * (`PrMeta.cost_usd`, summed across every done run — see criterion 12): a
 * formatted price when known, an em dash when unknown (never a fake $0.00).
 * The FINDINGS column shows severity pills from `PrMeta.findings_counts`
 * and a read-only hover popover with per-finding previews.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrMeta, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockUsePrReviews = vi.fn();
vi.mock("@/lib/api/reviews", () => ({
  usePrReviews: (...args: unknown[]) => mockUsePrReviews(...args),
}));

beforeEach(() => {
  mockUsePrReviews.mockReturnValue({ data: undefined });
});

afterEach(() => {
  cleanup();
  mockUsePrReviews.mockReset();
});

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr1",
    number: 482,
    title: "Add rate limiting",
    author: "marisa.koch",
    branch: "feat/rl",
    base: "main",
    head_sha: "abc123",
    additions: 10,
    deletions: 2,
    files_count: 1,
    status: "needs_review",
    opened_at: "2026-06-11T18:44:34.000Z",
    updated_at: "2026-06-11T18:44:34.000Z",
    score: null,
    ...o,
  };
}

function renderRow(p: PrMeta) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <PRRow pr={p} repoId="repo1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("PRRow — COST column", () => {
  it("shows the formatted total cost when known", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows an em dash — never $0.00 — when cost is unknown", () => {
    renderRow(pr({ cost_usd: null, score: 90 }));
    expect(screen.getByTestId("cost-cell")).toHaveTextContent("—");
  });
});

describe("PRRow — FINDINGS column", () => {
  it("renders a pill per present severity, in CRITICAL → WARNING → SUGGESTION order", () => {
    renderRow(pr({ findings_counts: { WARNING: 2, CRITICAL: 1 } }));
    const pills = screen.getAllByText(/^\d+$/);
    expect(pills.map((el) => el.textContent)).toEqual(["1", "2"]);
  });

  it("shows an em dash when there are no findings", () => {
    renderRow(pr({ findings_counts: null }));
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("opens a popover titled 'N FINDINGS IN THIS RUN' on hover, with a read-only preview", () => {
    const reviews: ReviewRecord[] = [
      {
        id: "r1",
        pr_id: "pr1",
        agent_id: "a1",
        run_id: "run1",
        agent_name: "Security",
        kind: "review",
        verdict: "request_changes",
        summary: null,
        score: 61,
        model: "gpt-4.1",
        grounding: null,
        created_at: "2026-06-11T18:44:34.000Z",
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
            review_id: "r1",
            accepted_at: null,
            dismissed_at: null,
          },
        ],
      },
    ];
    mockUsePrReviews.mockReturnValue({ data: reviews });

    renderRow(pr({ findings_counts: { CRITICAL: 1 } }));
    fireEvent.mouseEnter(screen.getByTestId("findings-cell"));

    expect(screen.getByText("1 FINDINGS IN THIS RUN")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
