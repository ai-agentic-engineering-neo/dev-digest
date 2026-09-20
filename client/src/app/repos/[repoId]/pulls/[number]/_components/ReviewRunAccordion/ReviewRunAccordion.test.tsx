/**
 * ReviewRunAccordion — the header carries the run's cost between the score and
 * the timestamp, and the expanded VerdictBanner repeats it with the token flow.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(cleanup);

function review(o: Partial<ReviewRecord> = {}): ReviewRecord {
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
    model: "deepseek-v4-flash",
    cost_usd: 0.0013,
    tokens_in: 9119,
    tokens_out: 1240,
    created_at: "2026-06-13T20:52:51.000Z",
    findings: [],
    ...o,
  };
}

function renderAccordion(rec: ReviewRecord) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <ReviewRunAccordion review={rec} prId="pr-1" defaultOpen={false} />
    </NextIntlClientProvider>,
  );
}

describe("ReviewRunAccordion — run cost", () => {
  it("shows the cost in the collapsed header", () => {
    renderAccordion(review());
    expect(screen.getByText("$0.001")).toBeInTheDocument();
  });

  it("repeats cost + token flow in the expanded verdict banner", () => {
    renderAccordion(review());
    fireEvent.click(screen.getByText("Security Reviewer"));
    expect(screen.getAllByText("$0.001").length).toBeGreaterThan(1);
    expect(screen.getByText("9.1K→1.2K")).toBeInTheDocument();
  });

  it("an unpriced run shows an em dash rather than a zero cost", () => {
    renderAccordion(review({ cost_usd: null, tokens_in: null, tokens_out: null }));
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
