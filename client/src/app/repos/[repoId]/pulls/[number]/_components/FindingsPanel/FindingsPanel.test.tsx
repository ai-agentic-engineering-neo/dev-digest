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

  it("clicking the active filter chip clears it (calls onSeverityChange(null))", () => {
    const onSeverityChange = vi.fn();
    renderWithIntl(
      <FindingsPanel
        findings={MIXED_FINDINGS}
        prId="pr1"
        severity="WARNING"
        onSeverityChange={onSeverityChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Warning 1" }));
    expect(onSeverityChange).toHaveBeenCalledWith(null);
  });

  it("a severity filter with zero matches shows the empty state, not a blank list", () => {
    renderWithIntl(
      <FindingsPanel findings={FINDINGS} prId="pr1" severity="SUGGESTION" onSeverityChange={vi.fn()} />,
    );
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel — one control is both counter and filter (crit. 16/18)", () => {
  it("renders a single severity row — no duplicate read-only pills above it", () => {
    renderWithIntl(<FindingsPanel findings={MIXED_FINDINGS} prId="pr1" />);
    // 2 CRITICAL, 1 WARNING, 1 SUGGESTION → exactly three chips, once each.
    expect(screen.getByRole("button", { name: "Critical 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Warning 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggestion 1" })).toBeInTheDocument();
    // The old design also rendered a non-interactive pill per severity; if that
    // ever comes back these labels would resolve to two elements each.
    expect(screen.getAllByRole("button", { name: /^Critical/ })).toHaveLength(1);
  });

  it("clicking a chip asks for that severity", () => {
    const onSeverityChange = vi.fn();
    renderWithIntl(
      <FindingsPanel findings={MIXED_FINDINGS} prId="pr1" onSeverityChange={onSeverityChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Critical 2" }));
    expect(onSeverityChange).toHaveBeenCalledWith("CRITICAL");
  });

  it("the active chip is marked aria-pressed, the others are not", () => {
    renderWithIntl(
      <FindingsPanel
        findings={MIXED_FINDINGS}
        prId="pr1"
        severity="CRITICAL"
        onSeverityChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Critical 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Warning 1" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("chips keep showing every severity's count while one is filtered, so you can switch", () => {
    const { container } = renderWithIntl(
      <FindingsPanel
        findings={MIXED_FINDINGS}
        prId="pr1"
        severity="WARNING"
        onSeverityChange={vi.fn()}
      />,
    );
    expect(container.querySelectorAll("[data-finding-id]")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Critical 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggestion 1" })).toBeInTheDocument();
  });

  it("a severity with zero findings gets no chip — the filter can't lead to an empty list", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByRole("button", { name: "Critical 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Warning/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Suggestion/ })).not.toBeInTheDocument();
  });
});

describe("FindingsPanel — no LLM calls (crit. 19)", () => {
  it("toggling the severity filter never touches the network", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderWithIntl(
      <FindingsPanel findings={MIXED_FINDINGS} prId="pr1" severity="WARNING" onSeverityChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Critical 2" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
