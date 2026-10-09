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

function finding(id: string, severity: "CRITICAL" | "WARNING" | "SUGGESTION", title: string) {
  return {
    id,
    severity,
    category: "bug" as const,
    title,
    file: "src/foo.ts",
    start_line: 1,
    end_line: 1,
    rationale: "because.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding" as const,
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const REVIEW: ReviewRecord = {
  id: "r1",
  pr_id: "pr1",
  agent_id: "a1",
  run_id: "run1",
  agent_name: "Test Quality Reviewer",
  kind: "review",
  verdict: "request_changes",
  summary: "Needs work.",
  score: 17,
  model: "gpt-4.1",
  grounding: null,
  created_at: new Date().toISOString(),
  findings: [
    finding("f1", "CRITICAL", "All analytics endpoints are unauthenticated"),
    finding("f2", "WARNING", "Date-range boundary is inclusive"),
    finding("f3", "WARNING", "No tests for AnalyticsService"),
    finding("f4", "WARNING", "autoResolveRate / hitRate can sum to >100%"),
  ],
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ReviewRunAccordion severity filter row", () => {
  it("shows only present severities with counts matching the rendered finding cards", () => {
    renderWithIntl(<ReviewRunAccordion review={REVIEW} prId="pr1" defaultOpen />);

    // Icon+count filter row: 1 CRITICAL, 3 WARNING; no SUGGESTION pill (count 0).
    const group = screen.getByRole("group", { name: /filter by severity/i });
    expect(group).toHaveTextContent("1");
    expect(group).toHaveTextContent("3");
    expect(screen.queryByText("Critical")).not.toBeInTheDocument(); // icon+count only, no label text

    // Matches the number of finding cards of each severity rendered below.
    expect(screen.getByText("All analytics endpoints are unauthenticated")).toBeInTheDocument();
    expect(screen.getByText("Date-range boundary is inclusive")).toBeInTheDocument();
    expect(screen.getByText("No tests for AnalyticsService")).toBeInTheDocument();
    expect(screen.getByText("autoResolveRate / hitRate can sum to >100%")).toBeInTheDocument();
  });

  it("clicking the Warning pill filters the list but doesn't change the pill counts", () => {
    renderWithIntl(<ReviewRunAccordion review={REVIEW} prId="pr1" defaultOpen />);
    fireEvent.click(screen.getByRole("button", { name: /^warning$/i }));

    expect(screen.queryByText("All analytics endpoints are unauthenticated")).not.toBeInTheDocument();
    const group = screen.getByRole("group", { name: /filter by severity/i });
    expect(group).toHaveTextContent("1");
    expect(group).toHaveTextContent("3");
  });

  it("stays collapsed by default, hiding the filter row until expanded", () => {
    renderWithIntl(<ReviewRunAccordion review={REVIEW} prId="pr1" />);
    expect(screen.queryByRole("group", { name: /filter by severity/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /test quality reviewer/i }));
    expect(screen.getByRole("group", { name: /filter by severity/i })).toBeInTheDocument();
  });
});
