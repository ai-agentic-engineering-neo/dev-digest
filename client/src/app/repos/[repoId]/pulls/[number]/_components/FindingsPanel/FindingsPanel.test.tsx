import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate, isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

function finding(over: Partial<FindingRecord> & Pick<FindingRecord, "id" | "severity" | "title">): FindingRecord {
  return {
    category: "security",
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
    ...over,
  };
}

const FINDINGS: FindingRecord[] = [finding({ id: "f1", severity: "CRITICAL", title: "Hardcoded secret" })];

const MIXED: FindingRecord[] = [
  finding({ id: "c1", severity: "CRITICAL", title: "Crit one" }),
  finding({ id: "c2", severity: "CRITICAL", title: "Crit two" }),
  finding({ id: "w1", severity: "WARNING", title: "Warn low", confidence: 0.3 }),
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const counter = (name: RegExp) => screen.getByRole("button", { name });

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

describe("FindingsPanel severity counters", () => {
  it("shows a count for every level, including 0", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(counter(/2 CRITICAL/)).toBeInTheDocument();
    expect(counter(/1 WARNING/)).toBeInTheDocument();
    expect(counter(/0 SUGGESTION/)).toBeDisabled();
  });

  it("filters by the clicked level, moves to another level, and clears on second click", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);

    fireEvent.click(counter(/2 CRITICAL/));
    expect(counter(/2 CRITICAL/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Crit one")).toBeInTheDocument();
    expect(screen.getByText("Crit two")).toBeInTheDocument();
    expect(screen.queryByText("Warn low")).not.toBeInTheDocument();

    fireEvent.click(counter(/1 WARNING/));
    expect(counter(/1 WARNING/)).toHaveAttribute("aria-pressed", "true");
    expect(counter(/2 CRITICAL/)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Warn low")).toBeInTheDocument();
    expect(screen.queryByText("Crit one")).not.toBeInTheDocument();

    fireEvent.click(counter(/1 WARNING/));
    expect(counter(/1 WARNING/)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Crit one")).toBeInTheDocument();
    expect(screen.getByText("Warn low")).toBeInTheDocument();
  });

  it("combines the severity filter with Hide low confidence", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(counter(/1 WARNING/));
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByText("Warn low")).not.toBeInTheDocument();
    expect(screen.getByText("No findings match")).toBeInTheDocument();
    // counts reflect the whole run, not the filtered list
    expect(counter(/1 WARNING/)).toBeInTheDocument();
  });

  it("does not trigger any finding action when a counter is clicked", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(counter(/2 CRITICAL/));
    fireEvent.click(counter(/2 CRITICAL/));
    expect(mutate).not.toHaveBeenCalled();
  });
});
