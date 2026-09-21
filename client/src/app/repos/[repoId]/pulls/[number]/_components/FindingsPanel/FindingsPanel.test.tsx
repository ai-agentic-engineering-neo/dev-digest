import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [
  {
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
  },
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
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

const MANY: FindingRecord[] = [
  { ...FINDINGS[0]!, id: "c1", severity: "CRITICAL", title: "Crit one" },
  { ...FINDINGS[0]!, id: "w1", severity: "WARNING", title: "Warn one" },
  { ...FINDINGS[0]!, id: "w2", severity: "WARNING", title: "Warn two" },
];

const LOW_CRIT: FindingRecord[] = [
  { ...FINDINGS[0]!, id: "lc", severity: "CRITICAL", title: "Low crit", confidence: 0.2 },
  { ...FINDINGS[0]!, id: "hw", severity: "WARNING", title: "High warn", confidence: 0.9 },
];

describe("severity counters and filter", () => {
  it("shows a counter per present level and none for an absent one (AC-1, AC-2)", () => {
    renderWithIntl(<FindingsPanel findings={MANY} prId="pr1" />);
    const counters = screen.getByTestId("severity-counters");
    expect(within(counters).getByText("Critical")).toBeInTheDocument();
    expect(within(counters).getByText("Warning")).toBeInTheDocument();
    expect(within(counters).queryByText("Suggestion")).not.toBeInTheDocument();
  });

  it("the number equals the cards listed below (AC-5)", () => {
    renderWithIntl(<FindingsPanel findings={MANY} prId="pr1" />);
    const counters = screen.getByTestId("severity-counters");
    expect(within(counters).getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Warn one")).toBeInTheDocument();
    expect(screen.getByText("Warn two")).toBeInTheDocument();
  });

  it("offers all three buttons and disables absent levels (AC-8, AC-9)", () => {
    renderWithIntl(<FindingsPanel findings={MANY} prId="pr1" />);
    expect(screen.getByRole("button", { name: /suggestion/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /critical/i })).toBeEnabled();
  });

  it("filters, unions and clears (AC-10, AC-11, AC-12, AC-13)", () => {
    renderWithIntl(<FindingsPanel findings={MANY} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: /critical/i }));
    expect(screen.queryByText("Warn one")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /warning/i }));
    expect(screen.getByText("Crit one")).toBeInTheDocument();
    expect(screen.getByText("Warn one")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /critical/i }));
    expect(screen.queryByText("Crit one")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /warning/i }));
    expect(screen.getByText("Crit one")).toBeInTheDocument();
  });

  it("marks the active button pressed (AC-16)", () => {
    renderWithIntl(<FindingsPanel findings={MANY} prId="pr1" />);
    const crit = screen.getByRole("button", { name: /critical/i });
    expect(crit).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(crit);
    expect(crit).toHaveAttribute("aria-pressed", "true");
  });

  it("counts only what the confidence control admits (AC-6)", () => {
    renderWithIntl(<FindingsPanel findings={LOW_CRIT} prId="pr1" />);
    expect(within(screen.getByTestId("severity-counters")).getByText("Critical")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));

    const counters = screen.getByTestId("severity-counters");
    expect(within(counters).queryByText("Critical")).not.toBeInTheDocument();
    expect(within(counters).getByText("Warning")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /critical/i })).toBeDisabled();
  });

  it("an active button stays pressable when its count falls to zero (AC-9)", () => {
    renderWithIntl(<FindingsPanel findings={LOW_CRIT} prId="pr1" />);
    const crit = screen.getByRole("button", { name: /critical/i });
    fireEvent.click(crit);
    fireEvent.click(screen.getByRole("switch"));

    expect(within(screen.getByTestId("severity-counters")).queryByText("Critical")).not.toBeInTheDocument();
    expect(crit).toBeEnabled();

    fireEvent.click(crit);

    expect(crit).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("High warn")).toBeInTheDocument();
  });

  it("keeps the buttons visible when the narrowing empties the list (AC-14)", () => {
    renderWithIntl(<FindingsPanel findings={LOW_CRIT} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: /critical/i }));
    expect(screen.getByText("Low crit")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));

    expect(screen.getByText("No findings match")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /warning/i })).toBeInTheDocument();
  });
});
