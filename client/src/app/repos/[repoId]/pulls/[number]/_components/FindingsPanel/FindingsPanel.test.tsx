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

function finding(o: Partial<FindingRecord>): FindingRecord {
  return { ...FINDINGS[0]!, ...o };
}

// 2 CRITICAL (one low-confidence) + 1 WARNING, no SUGGESTION.
const MIXED: FindingRecord[] = [
  finding({ id: "c1", severity: "CRITICAL", title: "Crit one" }),
  finding({ id: "w1", severity: "WARNING", title: "Warn one" }),
  finding({ id: "c2", severity: "CRITICAL", title: "Crit two", confidence: 0.4 }),
];
const TITLES = ["Crit one", "Crit two", "Warn one"];

function pill(container: HTMLElement, severity: string) {
  return container.querySelector<HTMLButtonElement>(`button[data-severity="${severity}"]`);
}
function shownTitles() {
  return TITLES.filter((title) => screen.queryByText(title));
}

describe("FindingsPanel — severity pills", () => {
  it("shows a pill per present severity whose count matches the cards below", () => {
    const { container } = renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(pill(container, "CRITICAL")).toHaveTextContent("2 Critical");
    expect(pill(container, "WARNING")).toHaveTextContent("1 Warning");
    expect(pill(container, "SUGGESTION")).toBeNull();
    expect(shownTitles()).toEqual(TITLES);
  });

  it("clicking a pill keeps only that severity; clicking it again restores the full list", () => {
    const { container } = renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const critical = pill(container, "CRITICAL")!;

    fireEvent.click(critical);
    expect(critical).toHaveAttribute("aria-pressed", "true");
    expect(shownTitles()).toEqual(["Crit one", "Crit two"]);

    fireEvent.click(critical);
    expect(critical).toHaveAttribute("aria-pressed", "false");
    expect(shownTitles()).toEqual(TITLES);
  });

  it("switching pills swaps the filter", () => {
    const { container } = renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(pill(container, "CRITICAL")!);
    fireEvent.click(pill(container, "WARNING")!);
    expect(pill(container, "CRITICAL")).toHaveAttribute("aria-pressed", "false");
    expect(shownTitles()).toEqual(["Warn one"]);
  });

  it("counts follow hide-low-confidence so they still match the cards", () => {
    const { container } = renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(pill(container, "CRITICAL")).toHaveTextContent("1 Critical");
    expect(shownTitles()).toEqual(["Crit one", "Warn one"]);
  });
});
