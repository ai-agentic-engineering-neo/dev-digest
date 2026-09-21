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

  it("severity pills count the run's findings and filter the list", () => {
    const warning: FindingRecord = {
      ...FINDINGS[0]!,
      id: "f2",
      severity: "WARNING",
      category: "perf",
      title: "N+1 query in user list endpoint",
    };
    renderWithIntl(<FindingsPanel findings={[...FINDINGS, warning]} prId="pr1" />);
    const warnPill = screen.getByRole("button", { name: "1 Warning" });
    expect(screen.getByRole("button", { name: "1 Critical" })).toBeInTheDocument();

    fireEvent.click(warnPill);
    expect(warnPill).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();

    fireEvent.click(warnPill);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
  });

  it("pill counts match the cards shown when low confidence is hidden", () => {
    const lowCrit: FindingRecord = { ...FINDINGS[0]!, id: "f3", title: "Low-confidence crit", confidence: 0.3 };
    renderWithIntl(<FindingsPanel findings={[...FINDINGS, lowCrit]} prId="pr1" />);
    expect(screen.getByRole("button", { name: "2 Critical" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("button", { name: "1 Critical" })).toBeInTheDocument();
    expect(screen.queryByText("Low-confidence crit")).not.toBeInTheDocument();
  });
});
