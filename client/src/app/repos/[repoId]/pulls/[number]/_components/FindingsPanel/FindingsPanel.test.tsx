import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const mutate = vi.fn();
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate, isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

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

/** Two severities present, plus one dismissed CRITICAL — used by the
 *  severity-pill tests below. */
const MULTI_SEVERITY_FINDINGS: FindingRecord[] = [
  {
    id: "crit1",
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
  {
    id: "crit2-dismissed",
    severity: "CRITICAL",
    category: "bug",
    title: "Dismissed critical",
    file: "src/other.ts",
    start_line: 5,
    end_line: 5,
    rationale: "Already dismissed but still an active-list item.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "warn1",
    severity: "WARNING",
    category: "perf",
    title: "N+1 query",
    file: "src/api.ts",
    start_line: 20,
    end_line: 20,
    rationale: "Loop calls the DB per item.",
    suggestion: null,
    confidence: 0.8,
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

describe("FindingsPanel — severity pills", () => {
  it("renders one pill per severity present, and none for absent severities", () => {
    renderWithIntl(<FindingsPanel findings={MULTI_SEVERITY_FINDINGS} prId="pr1" />);
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("WARNING")).toBeInTheDocument();
    expect(screen.queryByText("SUGGESTION")).not.toBeInTheDocument();
  });

  it("a dismissed CRITICAL finding is still counted in the CRITICAL pill", () => {
    renderWithIntl(<FindingsPanel findings={MULTI_SEVERITY_FINDINGS} prId="pr1" />);
    // Two CRITICAL findings exist (one dismissed) — the pill's count reflects both.
    const critPill = screen.getByText("CRITICAL").closest("button")!;
    expect(critPill).toHaveTextContent("2");
  });

  it("clicking a pill narrows the list to that severity; the pill's own count equals the shown cards", () => {
    renderWithIntl(<FindingsPanel findings={MULTI_SEVERITY_FINDINGS} prId="pr1" />);
    fireEvent.click(screen.getByText("WARNING").closest("button")!);
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.queryByText("Dismissed critical")).not.toBeInTheDocument();
  });

  it("clicking the same pill again clears the filter, restoring the full list", () => {
    renderWithIntl(<FindingsPanel findings={MULTI_SEVERITY_FINDINGS} prId="pr1" />);
    const warnPill = screen.getByText("WARNING").closest("button")!;
    fireEvent.click(warnPill);
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    fireEvent.click(warnPill);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
  });

  it("pressing Escape while a filter is active clears it", () => {
    renderWithIntl(<FindingsPanel findings={MULTI_SEVERITY_FINDINGS} prId="pr1" />);
    fireEvent.click(screen.getByText("WARNING").closest("button")!);
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("does not render a pill row at all when there are no findings", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("group", { name: /filter findings by severity/i })).not.toBeInTheDocument();
  });

  it("seeds the filter from initialSeverity (deep link / Timeline chip) without touching the pills themselves", () => {
    renderWithIntl(
      <FindingsPanel findings={MULTI_SEVERITY_FINDINGS} prId="pr1" initialSeverity="WARNING" />,
    );
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    // The pill row still renders every present severity — seeding only drives
    // the SAME setSeverityFilter the pills own.
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
  });

  it("re-applies the same initialSeverity when focusNonce bumps (after the user cleared it)", () => {
    const { rerender } = renderWithIntl(
      <FindingsPanel
        findings={MULTI_SEVERITY_FINDINGS}
        prId="pr1"
        initialSeverity="WARNING"
        focusNonce={1}
      />,
    );
    // User clears the filter locally.
    fireEvent.click(screen.getByText("WARNING").closest("button")!);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    // Same severity arrives again — only the nonce differs, and it must re-fire.
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPanel
          findings={MULTI_SEVERITY_FINDINGS}
          prId="pr1"
          initialSeverity="WARNING"
          focusNonce={2}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
  });

  it("an inert (never-changing) focusNonce never touches the user's own filter", () => {
    // What every NON-targeted accordion is handed by FindingsTab: null severity
    // + nonce 0, forever. Re-rendering with those must not reset the filter.
    const { rerender } = renderWithIntl(
      <FindingsPanel findings={MULTI_SEVERITY_FINDINGS} prId="pr1" initialSeverity={null} focusNonce={0} />,
    );
    fireEvent.click(screen.getByText("WARNING").closest("button")!);
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPanel findings={MULTI_SEVERITY_FINDINGS} prId="pr1" initialSeverity={null} focusNonce={0} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
  });

  it("keeps hideLow across a re-trigger — it lives outside the remounted body", () => {
    const LOW_ONE = { ...MULTI_SEVERITY_FINDINGS[2]!, id: "low", title: "Low hunch", confidence: 0.4 };
    const { rerender } = renderWithIntl(
      <FindingsPanel
        findings={[MULTI_SEVERITY_FINDINGS[0]!, LOW_ONE]}
        prId="pr1"
        initialSeverity={null}
        focusNonce={1}
      />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByText("Low hunch")).not.toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPanel
          findings={[MULTI_SEVERITY_FINDINGS[0]!, LOW_ONE]}
          prId="pr1"
          initialSeverity={null}
          focusNonce={2}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText("Low hunch")).not.toBeInTheDocument();
  });

  it("resets keyboard focus when a severity filter shrinks the list, so a/d still act on something", () => {
    renderWithIntl(<FindingsPanel findings={MULTI_SEVERITY_FINDINGS} prId="pr1" />);
    // Focus the 3rd item (index 2, the WARNING one) via j/j.
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "j" });
    // Filter down to CRITICAL (2 items) — the old focusIdx (2) would be out of range.
    fireEvent.click(screen.getByText("CRITICAL").closest("button")!);
    mutate.mockClear();
    fireEvent.keyDown(window, { key: "a" });
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ findingId: "crit1", action: "accept" }),
    );
  });
});

/** One finding per severity, all high-confidence — for the expand-default rule. */
const ONE_PER_SEVERITY: FindingRecord[] = [
  { ...FINDINGS[0]!, id: "e-crit", severity: "CRITICAL", title: "Crit title", rationale: "CRIT RATIONALE" },
  { ...FINDINGS[0]!, id: "e-warn", severity: "WARNING", title: "Warn title", rationale: "WARN RATIONALE" },
  { ...FINDINGS[0]!, id: "e-sugg", severity: "SUGGESTION", title: "Sugg title", rationale: "SUGG RATIONALE" },
];

describe("FindingsPanel — expand defaults are severity-based, not positional", () => {
  it("opens CRITICAL and WARNING cards on arrival and leaves SUGGESTION collapsed", () => {
    renderWithIntl(<FindingsPanel findings={ONE_PER_SEVERITY} prId="pr1" />);
    // An expanded card renders its rationale body; a collapsed one does not.
    expect(screen.getByText("CRIT RATIONALE")).toBeInTheDocument();
    expect(screen.getByText("WARN RATIONALE")).toBeInTheDocument();
    expect(screen.queryByText("SUGG RATIONALE")).not.toBeInTheDocument();
  });

  it("is not positional: a first-in-list SUGGESTION stays collapsed", () => {
    // Only a SUGGESTION — under the old `i === 0` rule this card would be open.
    renderWithIntl(<FindingsPanel findings={[ONE_PER_SEVERITY[2]!]} prId="pr1" />);
    expect(screen.getByText("Sugg title")).toBeInTheDocument();
    expect(screen.queryByText("SUGG RATIONALE")).not.toBeInTheDocument();
  });
});

describe("FindingsPanel — hide low confidence actually filters", () => {
  const LOW: FindingRecord = {
    ...FINDINGS[0]!,
    id: "low1",
    severity: "SUGGESTION",
    title: "Low confidence hunch",
    confidence: 0.4, // below LOW_CONFIDENCE_THRESHOLD (0.65)
  };

  it("removes a sub-threshold finding from the DOM when toggled on, and restores it when off", () => {
    renderWithIntl(<FindingsPanel findings={[FINDINGS[0]!, LOW]} prId="pr1" />);
    expect(screen.getByText("Low confidence hunch")).toBeInTheDocument();

    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);
    expect(screen.queryByText("Low confidence hunch")).not.toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText("Low confidence hunch")).toBeInTheDocument();
  });

  it("a hidden low-confidence finding also drops out of its severity pill count", () => {
    renderWithIntl(<FindingsPanel findings={[FINDINGS[0]!, LOW]} prId="pr1" />);
    expect(screen.getByText("SUGGESTION")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    // The pill's count must always equal the cards actually rendered below it.
    expect(screen.queryByText("SUGGESTION")).not.toBeInTheDocument();
  });
});

describe("FindingsPanel — pill changes are reported for URL sync", () => {
  it("reports the pill's severity on click, and null when the same pill clears it", () => {
    const onChange = vi.fn();
    renderWithIntl(
      <FindingsPanel findings={MULTI_SEVERITY_FINDINGS} prId="pr1" onSeverityFilterChange={onChange} />,
    );
    const warning = screen.getByText("WARNING").closest("button")!;
    fireEvent.click(warning);
    expect(onChange).toHaveBeenLastCalledWith("WARNING");
    fireEvent.click(warning);
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("reports null when Escape clears an active filter", () => {
    const onChange = vi.fn();
    renderWithIntl(
      <FindingsPanel findings={MULTI_SEVERITY_FINDINGS} prId="pr1" onSeverityFilterChange={onChange} />,
    );
    fireEvent.click(screen.getByText("CRITICAL").closest("button")!);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("does NOT report on mount, even when seeded from a deep link", () => {
    const onChange = vi.fn();
    renderWithIntl(
      <FindingsPanel
        findings={MULTI_SEVERITY_FINDINGS}
        prId="pr1"
        initialSeverity="CRITICAL"
        onSeverityFilterChange={onChange}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
