import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";
import { visibleFindings } from "./helpers";

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

/* Review runs → expanded run: "N CRITICAL · N WARNING" pills under the verdict,
   then Critical / Warning / Suggestion filter buttons
   (server/specs/02-findings-by-severity.md, Amendment). */
describe("FindingsPanel — severity pills and filter", () => {
  const f = (id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord => ({
    ...FINDINGS[0]!,
    id,
    severity,
    title: `Finding ${id}`,
    confidence,
  });
  // Deliberately unsorted: 2 CRITICAL, 1 WARNING, no SUGGESTION.
  const MIXED = [f("w1", "WARNING"), f("c1", "CRITICAL"), f("c2", "CRITICAL", 0.4)];
  const SEVERITY_OF = Object.fromEntries(MIXED.map((x) => [x.id, x.severity]));

  const cardIds = (container: HTMLElement) =>
    [...container.querySelectorAll("[data-finding-id]")].map((el) => el.getAttribute("data-finding-id")!);
  const pills = () => within(screen.getByRole("group", { name: "Findings by severity" }));
  const filterButton = (name: string) =>
    within(screen.getByRole("group", { name: "Filter by severity" })).getByRole("button", { name });

  it("shows a pill only for the severities present", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(pills().getByText("2 CRITICAL")).toBeInTheDocument();
    expect(pills().getByText("1 WARNING")).toBeInTheDocument();
    expect(pills().queryByText(/SUGGESTION/)).not.toBeInTheDocument();
  });

  it("each pill's number equals the cards of that severity listed below", () => {
    const { container } = renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const ids = cardIds(container);
    expect(ids.filter((id) => SEVERITY_OF[id] === "CRITICAL")).toHaveLength(2);
    expect(ids.filter((id) => SEVERITY_OF[id] === "WARNING")).toHaveLength(1);
  });

  it("renders no pill row when the run has no findings", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("group", { name: "Findings by severity" })).not.toBeInTheDocument();
  });

  it("always offers the three filters: Critical, Warning, Suggestion", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const group = within(screen.getByRole("group", { name: "Filter by severity" }));
    expect(group.getAllByRole("button").map((b) => b.textContent)).toEqual(["Critical", "Warning", "Suggestion"]);
  });

  it("a filter keeps only its severity; clicking it again restores the full list", () => {
    const { container } = renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);

    fireEvent.click(filterButton("Critical"));
    expect(cardIds(container).sort()).toEqual(["c1", "c2"]);

    fireEvent.click(filterButton("Critical"));
    expect(cardIds(container).sort()).toEqual(["c1", "c2", "w1"]);
  });

  it("switching filters replaces the previous one", () => {
    const { container } = renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(filterButton("Critical"));
    fireEvent.click(filterButton("Warning"));
    expect(cardIds(container)).toEqual(["w1"]);
  });

  it("a severity with no findings shows the empty state; the pills stay", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(filterButton("Suggestion"));
    expect(screen.getByText("No findings match")).toBeInTheDocument();
    expect(pills().getByText("2 CRITICAL")).toBeInTheDocument();
  });

  it("visibleFindings applies the severity on top of hide-low-confidence", () => {
    expect(visibleFindings(MIXED, false, "CRITICAL").map((x) => x.id)).toEqual(["c1", "c2"]);
    expect(visibleFindings(MIXED, true, "CRITICAL").map((x) => x.id)).toEqual(["c1"]);
    expect(visibleFindings(MIXED, false).map((x) => x.id)).toEqual(["c1", "c2", "w1"]);
  });
});
