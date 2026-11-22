/**
 * ReviewRunAccordion — header shows the run's cost between the score and the time.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReviewRecord } from "@devdigest/shared";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: () => {}, isPending: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(cleanup);

function review(o: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rv-1",
    pr_id: "pr-1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "Two critical exposures.",
    score: 38,
    model: "deepseek/deepseek-v4-flash",
    grounding: "3/3 passed",
    created_at: "2026-06-13T20:52:51.000Z",
    cost_usd: 0.0013,
    findings: [],
    ...o,
  };
}

describe("ReviewRunAccordion — cost badge", () => {
  it("shows the run cost with a tooltip, after the score", () => {
    render(<ReviewRunAccordion review={review({ cost_usd: 0.0013 })} prId="pr-1" />);
    const cost = screen.getByText("$0.001");
    expect(cost).toHaveAttribute("title", "Cost of this review");
    const score = screen.getByText("38");
    // score precedes cost in the header
    expect(score.compareDocumentPosition(cost) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("shows an em-dash when the cost is unknown (null or field missing)", () => {
    const { rerender } = render(<ReviewRunAccordion review={review({ cost_usd: null })} prId="pr-1" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    const { cost_usd: _omit, ...legacy } = review({});
    rerender(<ReviewRunAccordion review={legacy} prId="pr-1" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
