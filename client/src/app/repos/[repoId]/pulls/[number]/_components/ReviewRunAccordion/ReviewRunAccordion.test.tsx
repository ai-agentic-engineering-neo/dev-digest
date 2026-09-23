/**
 * ReviewRunAccordion — the header carries the run's cost · in→out tokens
 * (server/specs/01-run-cost-badge.md), next to the verdict and score.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReviewRecord } from "@devdigest/shared";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
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
