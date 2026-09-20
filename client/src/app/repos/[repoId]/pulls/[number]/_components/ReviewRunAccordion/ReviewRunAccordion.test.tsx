import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReviewRecord } from "@devdigest/shared";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(cleanup);

function review(o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "rev-1",
    pr_id: "pr-1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "comment",
    summary: "s",
    score: 72,
    model: "deepseek/deepseek-v4-flash",
    grounding: "1/1 passed",
    created_at: "2026-06-13T20:52:51.000Z",
    findings: [],
    ...o,
  };
}

describe("ReviewRunAccordion — cost display", () => {
  it("renders the run's cost next to the timestamp", () => {
    render(<ReviewRunAccordion review={review()} prId="pr-1" cost={0.001} />);
    expect(screen.getByText("$0.0010")).toBeInTheDocument();
  });

  it("renders '—' when cost is unavailable (no cost prop / null)", () => {
    render(<ReviewRunAccordion review={review()} prId="pr-1" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
