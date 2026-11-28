/**
 * ReviewRunAccordion — the run header shows the run's cost and tokens next to
 * the time it ran, and no price at all when the run's cost is unknown.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { ReviewRunAccordion } from "./ReviewRunAccordion";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

function review(o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "rev-1",
    pr_id: "pr-1",
    agent_id: "agent-1",
    run_id: "run-1",
    agent_name: "General Reviewer",
    kind: "review",
    verdict: "comment",
    summary: "Looks fine",
    score: 82,
    model: "deepseek/deepseek-v4-flash",
    created_at: "2026-11-28T09:00:00.000Z",
    findings: [],
    ...o,
  };
}

function renderRun(r: ReviewRecord) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <ReviewRunAccordion review={r} prId="pr-1" />
    </NextIntlClientProvider>,
  );
}

describe("ReviewRunAccordion run cost", () => {
  it("shows cost and tokens right before the run time", () => {
    renderRun(review({ cost_usd: 0.014, tokens_in: 8240, tokens_out: 1290 }));
    const badge = screen.getByTestId("run-cost-badge");
    expect(badge.textContent).toBe("$0.014 · 8.2K→1.3K");
    expect(badge.getAttribute("aria-label")).toBe("Review run cost $0.014");
    const time = badge.nextElementSibling as HTMLElement;
    expect(time.textContent).toBe(new Date("2026-11-28T09:00:00.000Z").toLocaleString());
  });

  it("shows no price when the run cost is unknown", () => {
    renderRun(review({ cost_usd: null, tokens_in: 100, tokens_out: 10 }));
    expect(screen.queryByTestId("run-cost-badge")).toBeNull();
    expect(screen.queryByText(/\$0\.00/)).toBeNull();
  });

  it("shows no price for reviews from an older API without usage fields", () => {
    renderRun(review());
    expect(screen.queryByTestId("run-cost-badge")).toBeNull();
  });
});
