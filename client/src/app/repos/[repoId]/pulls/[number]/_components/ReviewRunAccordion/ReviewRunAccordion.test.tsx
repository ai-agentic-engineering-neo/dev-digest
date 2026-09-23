/**
 * ReviewRunAccordion — the header carries the run's cost · in→out tokens
 * (server/specs/01-run-cost-badge.md), next to the verdict and score. The
 * expanded body puts the severity pills under the verdict + PR SCORE
 * (server/specs/02-findings-by-severity.md, Amendment).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(cleanup);

function review(o: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rev-1",
    pr_id: "pr-1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "Two blockers.",
    score: 38,
    model: "deepseek/deepseek-v4-flash",
    created_at: "2026-09-23T20:52:51.000Z",
    findings: [],
    ...o,
  };
}

describe("ReviewRunAccordion — run cost in the header", () => {
  it("shows cost · in→out tokens of the run that produced the review", () => {
    render(<ReviewRunAccordion review={review({ cost_usd: 0.0141, tokens_in: 8212, tokens_out: 1301 })} prId="pr-1" />);
    expect(screen.getByText("$0.014 · 8.2K→1.3K")).toBeInTheDocument();
  });

  it("a review without run usage (seeded / pre-migration) reads '—'", () => {
    render(<ReviewRunAccordion review={review({ run_id: null })} prId="pr-1" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});

describe("ReviewRunAccordion — expanded run shows severity pills under the verdict", () => {
  const finding = (id: string, severity: FindingRecord["severity"]): FindingRecord => ({
    id,
    severity,
    category: "security",
    title: `Finding ${id}`,
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rev-1",
    accepted_at: null,
    dismissed_at: null,
  });

  it("verdict + PR SCORE → '2 CRITICAL · 1 SUGGESTION' → finding cards", () => {
    const findings = [finding("c1", "CRITICAL"), finding("s1", "SUGGESTION"), finding("c2", "CRITICAL")];
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <ReviewRunAccordion review={review({ findings })} prId="pr-1" defaultOpen />
      </NextIntlClientProvider>,
    );
    const score = screen.getByText("PR SCORE");
    const critical = screen.getByText("2 CRITICAL");
    const suggestion = screen.getByText("1 SUGGESTION");
    const firstCard = screen.getByText("Finding c1");
    const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(score, critical)).toBe(true);
    expect(follows(critical, suggestion)).toBe(true);
    expect(follows(suggestion, firstCard)).toBe(true);
    expect(screen.queryByText(/WARNING/)).not.toBeInTheDocument();
  });
});
