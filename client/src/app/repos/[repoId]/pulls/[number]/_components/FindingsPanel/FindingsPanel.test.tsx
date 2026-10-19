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

function finding(id: string, severity: FindingRecord["severity"], title: string, confidence = 0.9) {
  return { ...FINDINGS[0]!, id, severity, title, confidence };
}

const MIXED: FindingRecord[] = [
  finding("c1", "CRITICAL", "Crit one"),
  finding("c2", "CRITICAL", "Crit two", 0.4),
  finding("w1", "WARNING", "Warn one"),
];

const chip = (name: RegExp) => screen.getByRole("button", { name });

describe("FindingsPanel severity counters", () => {
  it("shows a count per severity and disables empty levels", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(chip(/2 CRITICAL/)).toBeEnabled();
    expect(chip(/1 WARNING/)).toBeEnabled();
    expect(chip(/0 SUGGESTION/)).toBeDisabled();
  });

  it("filters to the clicked severity and clears on a second click", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(chip(/WARNING/));
    expect(chip(/WARNING/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Warn one")).toBeInTheDocument();
    expect(screen.queryByText("Crit one")).not.toBeInTheDocument();

    fireEvent.click(chip(/WARNING/));
    expect(chip(/WARNING/)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Crit one")).toBeInTheDocument();
    expect(screen.getByText("Warn one")).toBeInTheDocument();
  });

  it("counts respect the hide-low-confidence toggle", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(chip(/1 CRITICAL/)).toBeInTheDocument();
    expect(screen.queryByText("Crit two")).not.toBeInTheDocument();
  });
});
