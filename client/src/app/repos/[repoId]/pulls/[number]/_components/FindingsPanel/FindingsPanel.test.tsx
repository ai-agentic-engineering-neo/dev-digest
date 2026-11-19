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

function finding(id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord {
  return { ...FINDINGS[0]!, id, severity, confidence, title: `${severity} finding ${id}` };
}

// 1 CRITICAL, 3 WARNING (one low-confidence), 0 SUGGESTION.
const MIXED: FindingRecord[] = [
  finding("c1", "CRITICAL"),
  finding("w1", "WARNING"),
  finding("w2", "WARNING"),
  finding("w3", "WARNING", 0.4),
];

const cardTitles = () => screen.queryAllByText(/ finding /).map((el) => el.textContent);

describe("FindingsPanel severity counters + filter", () => {
  it("shows a chip per level with findings and hides zero-count levels", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const group = screen.getByRole("group", { name: "Filter by severity" });
    expect(within(group).getByRole("button", { name: /1 CRITICAL/ })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: /3 WARNING/ })).toBeInTheDocument();
    expect(within(group).queryByRole("button", { name: /SUGGESTION/ })).not.toBeInTheDocument();
  });

  it("clicking a level keeps only that level; clicking again restores the full list", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(cardTitles()).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", { name: /3 WARNING/ }));
    const filtered = cardTitles();
    expect(filtered).toHaveLength(3);
    expect(filtered.every((t) => t?.startsWith("WARNING"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /3 WARNING/ }));
    expect(cardTitles()).toHaveLength(4);
  });

  it("counts follow Hide low confidence and the filter combines with it", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("button", { name: /2 WARNING/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /2 WARNING/ }));
    expect(cardTitles()).toEqual(["WARNING finding w1", "WARNING finding w2"]);
  });

  it("renders no chips for a run without findings", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("group", { name: "Filter by severity" })).not.toBeInTheDocument();
  });
});
