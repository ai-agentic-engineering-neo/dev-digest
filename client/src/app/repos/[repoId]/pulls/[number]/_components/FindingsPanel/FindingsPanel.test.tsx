/**
 * FindingsPanel — severity-filter pills + toolbar + FindingCard list.
 * The pills are the graded surface: «N CRITICAL · N WARNING · N SUGGESTION»
 * where each pill's count must equal the finding cards of that severity
 * rendered below it, and clicking a pill is a single-select toggle (click →
 * only that severity, click again → full list).
 */
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

function f(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f",
    severity: "CRITICAL",
    category: "security",
    title: "t",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rev1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

/** 1 CRITICAL, 2 WARNING (one below the 0.65 confidence bar), 1 SUGGESTION. */
const FINDINGS: FindingRecord[] = [
  f({ id: "c1", severity: "CRITICAL", title: "Critical one", confidence: 0.95 }),
  f({ id: "w1", severity: "WARNING", title: "Warning high", confidence: 0.9 }),
  f({ id: "w2", severity: "WARNING", title: "Warning low", confidence: 0.5 }),
  f({ id: "s1", severity: "SUGGESTION", title: "Suggestion one", confidence: 0.7 }),
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={[FINDINGS[0]!]} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Critical one")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel — severity pills", () => {
  it("renders one pill per present severity with counts that equal the cards below", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    // Pills: icon + label + count → accessible names "Critical 1", "Warning 2", "Suggestion 1".
    expect(screen.getByRole("button", { name: /critical 1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /warning 2/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /suggestion 1/i })).toBeInTheDocument();
    // …and the cards of each severity actually rendered match those counts.
    expect(screen.getByText("Critical one")).toBeInTheDocument();
    expect(screen.getByText("Warning high")).toBeInTheDocument();
    expect(screen.getByText("Warning low")).toBeInTheDocument();
    expect(screen.getByText("Suggestion one")).toBeInTheDocument();
  });

  it("omits pills for severities with zero findings", () => {
    renderWithIntl(<FindingsPanel findings={[FINDINGS[0]!]} prId="pr1" />);
    expect(screen.queryByRole("button", { name: /warning/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /suggestion/i })).not.toBeInTheDocument();
  });

  it("clicking a pill leaves only that severity; clicking it again restores the full list", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    const critical = screen.getByRole("button", { name: /critical 1/i });

    fireEvent.click(critical);
    expect(critical).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Critical one")).toBeInTheDocument();
    expect(screen.queryByText("Warning high")).not.toBeInTheDocument();
    expect(screen.queryByText("Warning low")).not.toBeInTheDocument();
    expect(screen.queryByText("Suggestion one")).not.toBeInTheDocument();

    fireEvent.click(critical);
    expect(critical).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Critical one")).toBeInTheDocument();
    expect(screen.getByText("Warning high")).toBeInTheDocument();
    expect(screen.getByText("Warning low")).toBeInTheDocument();
    expect(screen.getByText("Suggestion one")).toBeInTheDocument();
  });

  it("switching pills re-targets the filter instead of stacking", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: /critical 1/i }));
    fireEvent.click(screen.getByRole("button", { name: /warning 2/i }));
    expect(screen.queryByText("Critical one")).not.toBeInTheDocument();
    expect(screen.getByText("Warning high")).toBeInTheDocument();
    expect(screen.getByText("Warning low")).toBeInTheDocument();
  });

  it("pill counts follow the confidence filter (hide-low keeps crit 17 true)", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(screen.getByRole("switch")); // Hide low confidence on
    // The 0.5-confidence WARNING drops out → its pill now reads "Warning 1".
    expect(screen.getByRole("button", { name: /warning 1/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /warning 2/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Warning low")).not.toBeInTheDocument();
    // And the filter still composes with the shrunken set.
    fireEvent.click(screen.getByRole("button", { name: /warning 1/i }));
    expect(screen.getByText("Warning high")).toBeInTheDocument();
    expect(screen.queryByText("Critical one")).not.toBeInTheDocument();
  });
});
