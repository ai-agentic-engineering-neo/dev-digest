import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const mutate = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
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

function finding(id: string, severity: FindingRecord["severity"], title: string, confidence = 0.9): FindingRecord {
  return { ...FINDINGS[0]!, id, severity, title, confidence };
}

describe("FindingsPanel severity counters", () => {
  const RUN = [
    finding("c1", "CRITICAL", "Crit one"),
    finding("w1", "WARNING", "Warn sure"),
    finding("w2", "WARNING", "Warn unsure", 0.5),
  ];
  const titles = () => ["Crit one", "Warn sure", "Warn unsure"].filter((t) => screen.queryByText(t));
  const hideLow = () => fireEvent.click(screen.getByRole("switch"));

  it("shows a counter per present level and hides empty levels", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    expect(screen.getByRole("button", { name: "1 Critical" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 Warning" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Suggestion/ })).toBeNull();
  });

  it("filters to the clicked level and clears on a second click", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    const warn = screen.getByRole("button", { name: "2 Warning" });
    fireEvent.click(warn);
    expect(warn).toHaveAttribute("aria-pressed", "true");
    expect(titles()).toEqual(["Warn sure", "Warn unsure"]);
    fireEvent.click(warn);
    expect(warn).toHaveAttribute("aria-pressed", "false");
    expect(titles()).toEqual(["Crit one", "Warn sure", "Warn unsure"]);
  });

  it("counts only what remains after hide-low-confidence", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "2 Warning" }));
    hideLow();
    expect(screen.getByRole("button", { name: "1 Warning" })).toBeInTheDocument();
    expect(titles()).toEqual(["Warn sure"]);
  });

  it("drops a filter whose level empties under hide-low-confidence", () => {
    const run = [finding("c1", "CRITICAL", "Crit one"), finding("w2", "WARNING", "Warn unsure", 0.5)];
    renderWithIntl(<FindingsPanel findings={run} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "1 Warning" }));
    hideLow();
    expect(screen.queryByRole("button", { name: /Warning/ })).toBeNull();
    expect(screen.getByText("Crit one")).toBeInTheDocument();
  });
});

describe("FindingsPanel j/k focus", () => {
  const RUN = [
    finding("c1", "CRITICAL", "Crit one"),
    finding("w1", "WARNING", "Warn one"),
    finding("w2", "WARNING", "Warn two"),
  ];
  const press = (key: string) => fireEvent.keyDown(window, { key });
  const acceptedId = () => mutate.mock.calls.at(-1)?.[0].findingId;

  it("moves focus with j and acts on the focused finding", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    press("j");
    press("a");
    expect(acceptedId()).toBe("w1");
  });

  it("resets focus to the first card when the severity filter changes", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    press("j");
    press("j");
    fireEvent.click(screen.getByRole("button", { name: "2 Warning" }));
    press("a");
    expect(acceptedId()).toBe("w1");
  });

  it("resets focus to the first card when hide-low-confidence toggles", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    press("j");
    fireEvent.click(screen.getByRole("switch"));
    press("a");
    expect(acceptedId()).toBe("c1");
  });
});
