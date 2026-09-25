import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
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
  FINDINGS[0]!,
  { ...FINDINGS[0]!, id: "f2", severity: "CRITICAL", title: "SQL injection" },
  { ...FINDINGS[0]!, id: "f3", severity: "WARNING", category: "perf", title: "N+1 query" },
  { ...FINDINGS[0]!, id: "f4", severity: "SUGGESTION", category: "style", title: "Rename helper" },
];

describe("FindingsPanel — severity counters + filter", () => {
  it("shows «N CRITICAL · N WARNING · N SUGGESTION» pills whose numbers equal the cards below", () => {
    renderWithIntl(<FindingsPanel findings={MANY} prId="pr1" />);
    const row = screen.getByTestId("severity-counts");
    expect(row).toHaveTextContent("Critical2");
    expect(row).toHaveTextContent("Warning1");
    expect(row).toHaveTextContent("Suggestion1");
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("SQL injection")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.getByText("Rename helper")).toBeInTheDocument();
  });

  it("omits pills for severities that are absent", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    const row = screen.getByTestId("severity-counts");
    expect(row).toHaveTextContent("Critical1");
    expect(row).not.toHaveTextContent("Warning");
    expect(row).not.toHaveTextContent("Suggestion");
  });

  it("filter buttons narrow to one severity and a second click clears the filter", () => {
    renderWithIntl(<FindingsPanel findings={MANY} prId="pr1" />);
    const group = screen.getByRole("group", { name: "Filter findings by severity" });
    const warning = within(group).getByRole("button", { name: /Warning/ });

    fireEvent.click(warning);
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.queryByText("SQL injection")).not.toBeInTheDocument();
    expect(screen.queryByText("Rename helper")).not.toBeInTheDocument();

    fireEvent.click(warning);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("SQL injection")).toBeInTheDocument();
    expect(screen.getByText("Rename helper")).toBeInTheDocument();
  });

  it("switching from one filter to another replaces it", () => {
    renderWithIntl(<FindingsPanel findings={MANY} prId="pr1" />);
    const group = screen.getByRole("group", { name: "Filter findings by severity" });
    fireEvent.click(within(group).getByRole("button", { name: /Critical/ }));
    expect(screen.queryByText("N+1 query")).not.toBeInTheDocument();
    fireEvent.click(within(group).getByRole("button", { name: /Suggestion/ }));
    expect(screen.getByText("Rename helper")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });
});
