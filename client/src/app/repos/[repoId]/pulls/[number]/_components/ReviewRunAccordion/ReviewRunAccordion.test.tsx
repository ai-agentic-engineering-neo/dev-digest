import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../../messages/en/common.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(cleanup);

const finding = (id: string, severity: FindingRecord["severity"]): FindingRecord => ({
  id,
  severity,
  category: "bug",
  title: `${severity} finding ${id}`,
  file: "src/hooks/error/use-error-handler.hook.tsx",
  start_line: 106,
  end_line: 109,
  rationale: "Details.",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "rev-1",
  accepted_at: null,
  dismissed_at: null,
});

function review(findings: FindingRecord[]): ReviewRecord {
  return {
    id: "rev-1",
    pr_id: "pr-1",
    agent_id: "sec",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "comment",
    summary: "Summary.",
    score: 61,
    model: null,
    created_at: "2026-09-16T15:55:07.161Z",
    findings,
  };
}

function renderAccordion(r: ReviewRecord) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview, common }}>
      <ReviewRunAccordion review={r} prId="pr-1" />
    </NextIntlClientProvider>,
  );
}

describe("ReviewRunAccordion — header severity icons", () => {
  const findings = [finding("a", "WARNING"), finding("b", "WARNING"), finding("c", "WARNING"), finding("d", "SUGGESTION")];

  it("shows per-severity icons instead of the plain finding count", () => {
    renderAccordion(review(findings));
    expect(screen.getByLabelText("3 Warning")).toBeInTheDocument();
    expect(screen.getByLabelText("1 Suggestion")).toBeInTheDocument();
    expect(screen.queryByText("4 findings")).not.toBeInTheDocument();
  });

  it("hovering the icons opens the findings popover; clicking them does not expand the card", () => {
    renderAccordion(review(findings));
    fireEvent.mouseEnter(screen.getByLabelText("3 Warning"));
    const dialog = screen.getByRole("dialog", { name: "4 findings" });
    expect(within(dialog).getByText("SUGGESTION finding d")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("3 Warning"));
    expect(screen.queryByText("Summary.")).not.toBeInTheDocument();
  });

  it("a run without findings keeps the '0 findings' text", () => {
    renderAccordion(review([]));
    expect(screen.getByText("0 findings")).toBeInTheDocument();
  });
});
