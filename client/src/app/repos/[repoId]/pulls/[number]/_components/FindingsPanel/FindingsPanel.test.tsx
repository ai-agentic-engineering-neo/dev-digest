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

const mk = (id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord => ({
  ...FINDINGS[0]!,
  id,
  severity,
  confidence,
  title: `${severity} ${id}`,
});

const MIXED: FindingRecord[] = [
  mk("c1", "CRITICAL"),
  mk("w1", "WARNING"),
  mk("w2", "WARNING", 0.5),
  mk("s1", "SUGGESTION"),
];

const titles = () => screen.queryAllByText(/^(CRITICAL|WARNING|SUGGESTION) \w+$/).map((e) => e.textContent);

describe("FindingsPanel severity counters", () => {
  it("counts findings per severity and hides zero levels", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(screen.getByRole("button", { name: "1 CRITICAL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 WARNING" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 SUGGESTION" })).toBeInTheDocument();
    cleanup();
    renderWithIntl(<FindingsPanel findings={MIXED.slice(1)} prId="pr1" />);
    expect(screen.queryByRole("button", { name: /CRITICAL/ })).toBeNull();
  });

  it("filters by the clicked severity and clears on second click", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const warn = screen.getByRole("button", { name: "2 WARNING" });
    fireEvent.click(warn);
    expect(warn).toHaveAttribute("aria-pressed", "true");
    expect(titles()).toEqual(["WARNING w1", "WARNING w2"]);
    fireEvent.click(warn);
    expect(titles()).toHaveLength(4);
  });

  it("combines with Hide low confidence", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "2 WARNING" }));
    fireEvent.click(screen.getByRole("switch"));
    expect(titles()).toEqual(["WARNING w1"]);
  });
});
