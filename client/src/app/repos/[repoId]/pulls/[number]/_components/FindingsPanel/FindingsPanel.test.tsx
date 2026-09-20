import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/api/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

function finding(overrides: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f",
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

const FINDINGS: FindingRecord[] = [
  finding({
    id: "f1",
    severity: "CRITICAL",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
  }),
  finding({ id: "f2", severity: "WARNING", title: "N+1 query" }),
  finding({ id: "f3", severity: "WARNING", title: "Unhandled promise" }),
  finding({ id: "f4", severity: "SUGGESTION", title: "Magic number" }),
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

describe("FindingsPanel severity pills", () => {
  it("renders one pill per present severity, with the count of matching cards", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByRole("button", { name: /critical/i })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /warning/i })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /suggestion/i })).toHaveTextContent("1");
  });

  it("hides the pill row entirely when there are no findings", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("button", { name: /critical/i })).not.toBeInTheDocument();
  });

  it("clicking a pill filters the list to that severity", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: /warning/i }));
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.getByText("Unhandled promise")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.queryByText("Magic number")).not.toBeInTheDocument();
  });

  it("clicking the active pill again clears the filter", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    const warningPill = screen.getByRole("button", { name: /warning/i });
    fireEvent.click(warningPill);
    fireEvent.click(warningPill);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.getByText("Magic number")).toBeInTheDocument();
  });
});
