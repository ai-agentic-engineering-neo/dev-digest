import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReviewRecord } from "@devdigest/shared";
import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(cleanup);

function review(o: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rev1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "Two critical exposures.",
    score: 38,
    model: "deepseek/deepseek-v4-flash",
    grounding: "2/2 passed",
    created_at: "2026-06-13T20:52:51.000Z",
    findings: [],
    ...o,
  };
}

function renderReview(r: ReviewRecord) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <ReviewRunAccordion review={r} prId="pr1" />
    </QueryClientProvider>,
  );
}

describe("ReviewRunAccordion — cost", () => {
  it("shows a known cost formatted as USD next to the score", () => {
    renderReview(review({ cost_usd: 0.001 }));
    expect(screen.getByText("$0.001")).toBeInTheDocument();
  });

  it("shows '—' (never '$0.00') when the run predates cost tracking", () => {
    renderReview(review({ cost_usd: null }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
