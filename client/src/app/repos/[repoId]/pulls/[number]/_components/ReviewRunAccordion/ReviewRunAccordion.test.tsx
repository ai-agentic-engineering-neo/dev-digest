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
    verdict: "comment",
    summary: "Looks fine.",
    score: 82,
    model: "gpt-4.1",
    grounding: "2/2 passed",
    cost_usd: 0.014,
    created_at: "2026-06-11T18:44:34.000Z",
    findings: [],
    ...o,
  };
}

describe("ReviewRunAccordion — cost", () => {
  it("shows the formatted cost between the score badge and the timestamp", () => {
    render(<ReviewRunAccordion review={review({ cost_usd: 0.014 })} prId="pr-1" />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows the em dash when the run's cost is unknown", () => {
    render(<ReviewRunAccordion review={review({ cost_usd: null })} prId="pr-1" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
