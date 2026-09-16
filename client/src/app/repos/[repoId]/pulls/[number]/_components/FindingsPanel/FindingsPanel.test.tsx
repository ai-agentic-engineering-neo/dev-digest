import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

function finding(o: Partial<FindingRecord>): FindingRecord {
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
    ...o,
  };
}

const FINDINGS: FindingRecord[] = [finding({})];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

/**
 * Severity filter pills — clicking one narrows the list below to that
 * severity; clicking it again clears the filter. Pill totals include
 * dismissed findings (they still render as muted cards), unlike the
 * PR-list/Timeline counters.
 */
describe("FindingsPanel — severity filter pills", () => {
  const mixed: FindingRecord[] = [
    finding({ id: "c1", severity: "CRITICAL", title: "Critical one" }),
    finding({ id: "c2", severity: "CRITICAL", title: "Critical two" }),
    finding({ id: "w1", severity: "WARNING", title: "Warning one" }),
    finding({ id: "s1", severity: "SUGGESTION", title: "Suggestion one", dismissed_at: "2026-06-13T20:00:00.000Z" }),
  ];

  it("shows only non-zero severity pills, with counts matching the cards below", () => {
    renderWithIntl(<FindingsPanel findings={mixed} prId="pr1" />);
    expect(screen.getByRole("button", { name: /2 Critical/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1 Warning/i })).toBeInTheDocument();
    // Dismissed findings still count on the pill (they render as muted cards).
    expect(screen.getByRole("button", { name: /1 Suggestion/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Critical (one|two)|Warning one|Suggestion one/)).toHaveLength(4);
  });

  it("clicking a pill narrows the list to that severity", () => {
    renderWithIntl(<FindingsPanel findings={mixed} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: /Warning/i }));
    expect(screen.getByText("Warning one")).toBeInTheDocument();
    expect(screen.queryByText("Critical one")).not.toBeInTheDocument();
    expect(screen.queryByText("Suggestion one")).not.toBeInTheDocument();
  });

  it("clicking the active pill again clears the filter", () => {
    renderWithIntl(<FindingsPanel findings={mixed} prId="pr1" />);
    const warningPill = screen.getByRole("button", { name: /Warning/i });
    fireEvent.click(warningPill);
    expect(screen.queryByText("Critical one")).not.toBeInTheDocument();
    fireEvent.click(warningPill);
    expect(screen.getByText("Critical one")).toBeInTheDocument();
    expect(screen.getByText("Suggestion one")).toBeInTheDocument();
  });

  it("does not render pills when there are no findings", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("button", { name: /Critical|Warning|Suggestion/i })).not.toBeInTheDocument();
  });
});
