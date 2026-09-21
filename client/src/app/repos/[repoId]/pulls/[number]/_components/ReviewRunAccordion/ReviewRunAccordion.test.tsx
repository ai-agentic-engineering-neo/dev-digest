import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(cleanup);

function review(o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "rv1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "Hardcoded secret.",
    score: 38,
    model: "gpt-4.1",
    created_at: "2026-06-13T20:52:51.000Z",
    findings: [],
    ...o,
  };
}

function renderAccordion(r: ReviewRecord) {
  // Mutations (delete, finding actions) need a client; nothing is fetched here.
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <ReviewRunAccordion review={r} prId="pr1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ReviewRunAccordion — run cost", () => {
  it("shows the run cost in the header", () => {
    renderAccordion(review({ cost_usd: 0.0013, tokens_in: 9119, tokens_out: 1240 }));
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });

  it("shows nothing in the header when the cost is unknown", () => {
    renderAccordion(review({ cost_usd: null }));
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("passes the run usage down to the verdict banner", () => {
    renderAccordion(review({ cost_usd: 0.0013, tokens_in: 9119, tokens_out: 1240 }));
    fireEvent.click(screen.getByText("Security Reviewer"));
    expect(screen.getByText("9k→1.2k")).toBeInTheDocument();
    expect(screen.getAllByText("$0.0013")).toHaveLength(2); // header + banner
  });
});
