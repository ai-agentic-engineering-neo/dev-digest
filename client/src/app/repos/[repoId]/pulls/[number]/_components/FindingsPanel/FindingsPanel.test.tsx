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

// ---- Severity counters + filter (M1) ---------------------------------------

function finding(
  id: string,
  severity: FindingRecord["severity"],
  title: string,
  confidence = 0.9,
): FindingRecord {
  return { ...FINDINGS[0]!, id, severity, title, confidence };
}

// 2 CRITICAL · 3 WARNING (two of them low confidence) · 0 SUGGESTION
const RUN: FindingRecord[] = [
  finding("c1", "CRITICAL", "Hardcoded secret"),
  finding("c2", "CRITICAL", "SQL injection in search"),
  finding("w1", "WARNING", "Off-by-one in pagination"),
  finding("w2", "WARNING", "Possibly flaky retry", 0.5),
  finding("w3", "WARNING", "Unbounded cache growth", 0.4),
];
const ALL_TITLES = RUN.map((f) => f.title);

/** Titles of the finding cards currently in the list, in RUN order. */
function listedTitles() {
  return ALL_TITLES.filter((title) => screen.queryByText(title) !== null);
}

const pill = (name: string) => screen.getByRole("button", { name });
const hideLowToggle = () => screen.getByRole("switch");

describe("FindingsPanel severity counters + filter", () => {
  afterEach(() => {
    mutate.mockClear();
    vi.restoreAllMocks();
  });

  it("shows counts per level that match the run's list, with 0 for an empty level", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    expect(screen.getByRole("group", { name: "Filter findings by severity" })).toHaveTextContent(
      "2 Critical·3 Warning·0 Suggestion",
    );
    expect(listedTitles()).toEqual(ALL_TITLES);
  });

  it("clicking a level keeps only that level's findings in the list", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    fireEvent.click(pill("3 Warning"));
    expect(listedTitles()).toEqual([
      "Off-by-one in pagination",
      "Possibly flaky retry",
      "Unbounded cache growth",
    ]);
    expect(pill("3 Warning")).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking another level moves the filter to it", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    fireEvent.click(pill("3 Warning"));
    fireEvent.click(pill("2 Critical"));
    expect(listedTitles()).toEqual(["Hardcoded secret", "SQL injection in search"]);
    expect(pill("2 Critical")).toHaveAttribute("aria-pressed", "true");
    expect(pill("3 Warning")).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking the active level again restores the full list", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    fireEvent.click(pill("2 Critical"));
    fireEvent.click(pill("2 Critical"));
    expect(listedTitles()).toEqual(ALL_TITLES);
    // All three counters look the same again.
    for (const name of ["2 Critical", "3 Warning", "0 Suggestion"]) {
      expect(pill(name)).toHaveAttribute("data-state", "neutral");
    }
  });

  it("combines with Hide low confidence (AND); counters keep the run totals", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    fireEvent.click(pill("3 Warning"));
    fireEvent.click(hideLowToggle());
    expect(listedTitles()).toEqual(["Off-by-one in pagination"]);
    expect(pill("3 Warning")).toBeInTheDocument();
  });

  it("a level with no findings shows the existing empty state", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    fireEvent.click(pill("0 Suggestion"));
    expect(listedTitles()).toEqual([]);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });

  it("counts follow refetched findings (accept/dismiss) and the filter survives", () => {
    const { rerender } = renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    fireEvent.click(pill("2 Critical"));

    // What usePrReviews delivers after accept/dismiss invalidates ["reviews", prId]:
    // the dismissed finding stays in the run, now with a dismissed_at stamp.
    const afterDismiss = RUN.map((f) =>
      f.id === "c2" ? { ...f, dismissed_at: "2026-11-24T10:00:00Z" } : f,
    );
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPanel findings={afterDismiss} prId="pr1" />
      </NextIntlClientProvider>,
    );
    expect(pill("2 Critical")).toHaveAttribute("aria-pressed", "true");
    expect(listedTitles()).toEqual(["Hardcoded secret", "SQL injection in search"]);

    // A new run payload with fewer findings updates the counters without a reload.
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPanel findings={afterDismiss.filter((f) => f.id !== "w3")} prId="pr1" />
      </NextIntlClientProvider>,
    );
    expect(pill("2 Warning")).toBeInTheDocument();
  });

  it("filtering is local: no finding action and no network request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    fireEvent.click(pill("3 Warning"));
    fireEvent.click(pill("2 Critical"));
    fireEvent.click(pill("2 Critical"));
    expect(mutate).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
