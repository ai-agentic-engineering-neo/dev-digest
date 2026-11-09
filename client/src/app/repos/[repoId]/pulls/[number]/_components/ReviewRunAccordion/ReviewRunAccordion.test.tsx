import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { ReviewRunAccordion } from "./ReviewRunAccordion";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../FindingsPanel", () => ({ FindingsPanel: () => <div /> }));

afterEach(cleanup);

function finding(id: string, severity: "CRITICAL" | "WARNING", dismissed: boolean) {
  return {
    id,
    review_id: "rv1",
    severity,
    dismissed_at: dismissed ? "2026-11-09T10:00:00Z" : null,
  };
}

const review = {
  id: "rv1",
  pr_id: "pr1",
  agent_id: "a1",
  run_id: "run1",
  agent_name: "Security",
  kind: "review",
  verdict: "request_changes",
  summary: "Summary",
  score: 61,
  model: null,
  created_at: "2026-11-09T10:00:00Z",
  findings: [finding("f1", "CRITICAL", false), finding("f2", "CRITICAL", true), finding("f3", "WARNING", false)],
} as unknown as ReviewRecord;

describe("ReviewRunAccordion", () => {
  it("shows the shared counts in the header and in the opened banner", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <ReviewRunAccordion review={review} prId="pr1" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/3 findings · 1 blocker$/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Security"));
    expect(screen.getByText("3 findings · 1 blockers")).toBeInTheDocument();
  });
});
