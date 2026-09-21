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

const mk = (id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord => ({
  ...FINDINGS[0]!,
  id,
  severity,
  confidence,
  title: `${severity} ${id}`,
});

// 3 CRITICAL (one low-confidence) · 2 WARNING · 1 SUGGESTION, deliberately unsorted.
const MIXED: FindingRecord[] = [
  mk("s1", "SUGGESTION"),
  mk("c1", "CRITICAL"),
  mk("w1", "WARNING"),
  mk("c2", "CRITICAL"),
  mk("w2", "WARNING"),
  mk("c3", "CRITICAL", 0.3),
];

const cardTitles = () => screen.queryAllByText(/^(CRITICAL|WARNING|SUGGESTION) [a-z]\d$/).map((n) => n.textContent);
const counters = () => screen.getByRole("group", { name: "Findings by severity" });

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

  it("shows a counter per present severity, number first", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const row = counters();
    expect(within(row).getByRole("button", { name: "3 critical" })).toHaveTextContent("3CRITICAL");
    expect(within(row).getByRole("button", { name: "2 warning" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "1 suggestion" })).toBeInTheDocument();
  });

  it("hides the pill of a severity with no findings, and the whole row with no findings", () => {
    const { unmount } = renderWithIntl(<FindingsPanel findings={[mk("w1", "WARNING")]} prId="pr1" />);
    expect(within(counters()).getAllByRole("button")).toHaveLength(1);
    unmount();
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("group", { name: "Findings by severity" })).toBeNull();
  });

  it("filter button keeps only that level; a second click restores the full list", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(cardTitles()).toHaveLength(6);

    fireEvent.click(screen.getByRole("button", { name: "Warning" }));
    expect(cardTitles()).toEqual(["WARNING w1", "WARNING w2"]);

    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    expect(cardTitles()).toEqual(["CRITICAL c1", "CRITICAL c2", "CRITICAL c3"]);

    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    expect(cardTitles()).toHaveLength(6);
  });

  it("clicking a counter pill filters like the matching button", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const pill = within(counters()).getByRole("button", { name: "1 suggestion" });
    fireEvent.click(pill);
    expect(pill).toHaveAttribute("aria-pressed", "true");
    expect(cardTitles()).toEqual(["SUGGESTION s1"]);
    fireEvent.click(pill);
    expect(cardTitles()).toHaveLength(6);
  });

  it("counts follow 'hide low confidence' so a pill equals the cards shown", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(within(counters()).getByRole("button", { name: "2 critical" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    expect(cardTitles()).toHaveLength(2);
  });
});
