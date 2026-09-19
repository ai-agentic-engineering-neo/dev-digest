import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import runsMessages from "../../../../../../../../messages/en/runs.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
}));

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(() => {
  cleanup();
  searchParams = new URLSearchParams();
});

function finding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "r1",
    pr_id: "pr1",
    agent_id: null,
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "Two issues found.",
    score: 61,
    model: null,
    grounding: null,
    created_at: "2026-06-13T20:52:51Z",
    findings: [
      finding({ id: "f1", severity: "CRITICAL", title: "Hardcoded secret" }),
      finding({ id: "f2", severity: "WARNING", title: "N+1 query" }),
    ],
    ...overrides,
  };
}

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, runs: runsMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ReviewRunAccordion — severity pills under the verdict", () => {
  it("renders one clickable pill per severity present, under VerdictBanner", () => {
    renderWithIntl(<ReviewRunAccordion review={review()} prId="pr1" defaultOpen />);
    const group = screen.getByRole("group", { name: "Findings by severity" });
    const buttons = Array.from(group.querySelectorAll("button"));
    expect(buttons.map((b) => b.textContent)).toEqual(["1 CRITICAL", "1 WARNING"]);
  });

  it("hides FindingsPanel's own severity counters so there is a single control", () => {
    renderWithIntl(<ReviewRunAccordion review={review()} prId="pr1" defaultOpen />);
    expect(screen.getAllByRole("group", { name: "Findings by severity" })).toHaveLength(1);
  });

  it("clicking a pill filters the findings list below; clicking it again clears the filter", () => {
    renderWithIntl(<ReviewRunAccordion review={review()} prId="pr1" defaultOpen />);
    const critical = screen.getByTitle("Show only CRITICAL findings");

    fireEvent.click(critical);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.queryByText("N+1 query")).not.toBeInTheDocument();
    expect(critical).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByTitle("Show all severities"));
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
  });

  it("pre-applies the filter from the ?severity= URL param", () => {
    searchParams = new URLSearchParams("tab=findings&severity=WARNING");
    renderWithIntl(<ReviewRunAccordion review={review()} prId="pr1" defaultOpen />);
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("falls back to FindingsPanel's own counters when the run has no verdict", () => {
    renderWithIntl(
      <ReviewRunAccordion review={review({ verdict: null, summary: null })} prId="pr1" defaultOpen />,
    );
    const group = screen.getByRole("group", { name: "Findings by severity" });
    expect(group.querySelectorAll("button")).toHaveLength(2);
    fireEvent.click(screen.getByTitle("Show only WARNING findings"));
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });
});
