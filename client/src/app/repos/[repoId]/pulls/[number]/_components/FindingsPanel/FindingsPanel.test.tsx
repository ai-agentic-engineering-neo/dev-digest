import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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

/** Two CRITICAL (one low-confidence), one WARNING, one SUGGESTION. */
const MIXED_FINDINGS: FindingRecord[] = [
  { ...FINDINGS[0]!, id: "c1", severity: "CRITICAL", confidence: 0.95 },
  { ...FINDINGS[0]!, id: "c2", severity: "CRITICAL", confidence: 0.3, title: "Low-confidence critical" },
  { ...FINDINGS[0]!, id: "w1", severity: "WARNING", confidence: 0.86, title: "N+1 query", category: "perf" },
  { ...FINDINGS[0]!, id: "s1", severity: "SUGGESTION", confidence: 0.7, title: "Extract magic number", category: "style" },
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

describe("FindingsPanel — severity pill count invariant (crit. 17)", () => {
  it("the pill count always equals the number of cards rendered below it", () => {
    const { container } = renderWithIntl(<FindingsPanel findings={MIXED_FINDINGS} prId="pr1" />);
    const cards = container.querySelectorAll("[data-finding-id]");
    expect(cards).toHaveLength(4);
    // 2 CRITICAL, 1 WARNING, 1 SUGGESTION — matches MIXED_FINDINGS exactly.
    const pills = screen.getAllByText(/^[0-9]+$/);
    expect(pills.map((el) => el.textContent).sort()).toEqual(["1", "1", "2"]);
  });

  it("still holds with 'hide low confidence' on — the pill recounts, not just the cards", () => {
    const { container } = renderWithIntl(<FindingsPanel findings={MIXED_FINDINGS} prId="pr1" />);
    fireEvent.click(screen.getByRole("switch"));
    // The low-confidence CRITICAL (c2) is now hidden — 3 cards, 1 CRITICAL pill.
    const cards = container.querySelectorAll("[data-finding-id]");
    expect(cards).toHaveLength(3);
    const pills = screen.getAllByText(/^[0-9]+$/);
    expect(pills.map((el) => el.textContent).sort()).toEqual(["1", "1", "1"]);
  });
});

describe("FindingsPanel — severity filter buttons (crit. 18)", () => {
  it("passing severity='WARNING' shows only the WARNING card", () => {
    const { container } = renderWithIntl(
      <FindingsPanel findings={MIXED_FINDINGS} prId="pr1" severity="WARNING" onSeverityChange={vi.fn()} />,
    );
    const cards = container.querySelectorAll("[data-finding-id]");
    expect(cards).toHaveLength(1);
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("clicking the active filter button clears it (calls onSeverityChange(null))", () => {
    const onSeverityChange = vi.fn();
    renderWithIntl(
      <FindingsPanel
        findings={MIXED_FINDINGS}
        prId="pr1"
        severity="WARNING"
        onSeverityChange={onSeverityChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Warning" }));
    expect(onSeverityChange).toHaveBeenCalledWith(null);
  });

  it("a severity filter with zero matches shows the empty state, not a blank list", () => {
    renderWithIntl(
      <FindingsPanel findings={FINDINGS} prId="pr1" severity="SUGGESTION" onSeverityChange={vi.fn()} />,
    );
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel — no LLM calls (crit. 19)", () => {
  it("toggling the severity filter never touches the network", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderWithIntl(
      <FindingsPanel findings={MIXED_FINDINGS} prId="pr1" severity="WARNING" onSeverityChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
