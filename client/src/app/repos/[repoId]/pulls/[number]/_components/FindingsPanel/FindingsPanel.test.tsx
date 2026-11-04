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

// Severity counters — client/specs/severity-counters.md
const make = (id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord => ({
  ...FINDINGS[0]!,
  id,
  severity,
  title: `${severity} finding ${id}`,
  confidence,
});
const MIXED: FindingRecord[] = [
  make("c1", "CRITICAL"),
  make("c2", "CRITICAL", 0.3), // low confidence
  make("w1", "WARNING"),
  make("w2", "WARNING"),
  make("w3", "WARNING"),
  make("s1", "SUGGESTION"),
];
const titles = () => screen.queryAllByText(/ finding /).map((el) => el.textContent);
const counter = (sev: string) => screen.getByRole("button", { name: new RegExp(`Show only ${sev} findings`) });

describe("FindingsPanel severity counters", () => {
  it("shows a count per level that matches the list", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(screen.getByRole("group", { name: "Filter findings by severity" })).toBeInTheDocument();
    expect(counter("CRITICAL")).toHaveAccessibleName("Show only CRITICAL findings (2)");
    expect(counter("WARNING")).toHaveAccessibleName("Show only WARNING findings (3)");
    expect(counter("SUGGESTION")).toHaveAccessibleName("Show only SUGGESTION findings (1)");
    expect(titles()).toHaveLength(6);
  });

  it("clicking a level shows only its findings; clicking it again shows all", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(counter("WARNING"));
    expect(titles()).toEqual(["WARNING finding w1", "WARNING finding w2", "WARNING finding w3"]);
    expect(counter("WARNING")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(counter("WARNING"));
    expect(titles()).toHaveLength(6);
    expect(counter("WARNING")).toHaveAttribute("aria-pressed", "false");
  });

  it("hide-low-confidence lowers the counters together with the list", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(counter("CRITICAL")).toHaveAccessibleName("Show only CRITICAL findings (1)");
    fireEvent.click(counter("CRITICAL"));
    expect(titles()).toEqual(["CRITICAL finding c1"]);
  });

  it("drops the filter when the selected level is emptied by hide-low-confidence", () => {
    renderWithIntl(<FindingsPanel findings={[make("c9", "CRITICAL", 0.2), make("w9", "WARNING")]} prId="pr1" />);
    fireEvent.click(counter("CRITICAL"));
    expect(titles()).toEqual(["CRITICAL finding c9"]);
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByRole("button", { name: /Show only CRITICAL findings/ })).not.toBeInTheDocument();
    expect(titles()).toEqual(["WARNING finding w9"]);
  });

  it("is not shown for a run without findings", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("group", { name: "Filter findings by severity" })).not.toBeInTheDocument();
  });
});
