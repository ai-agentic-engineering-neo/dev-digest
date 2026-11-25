import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, Severity } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/lib/hooks/reviews", () => ({
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

// ---- Severity counters + filter (SPEC client/specs/m1-severity-filter) ----

function mk(
  id: string,
  severity: Severity,
  { confidence = 0.9, dismissed = false }: { confidence?: number; dismissed?: boolean } = {},
): FindingRecord {
  return {
    ...FINDINGS[0]!,
    id,
    severity,
    title: `title-${id}`,
    confidence,
    dismissed_at: dismissed ? "2026-11-22T00:00:00Z" : null,
  };
}

// Mirrors the Security Reviewer screenshot: 1 CRITICAL, 3 WARNING, 1 SUGGESTION.
const RUN: FindingRecord[] = [
  mk("c1", "CRITICAL", { dismissed: true }),
  mk("w1", "WARNING"),
  mk("w2", "WARNING", { confidence: 0.5 }),
  mk("w3", "WARNING"),
  mk("s1", "SUGGESTION"),
];

const chip = (name: string) => screen.getByRole("button", { name });
const titles = () => screen.queryAllByText(/^title-/).map((el) => el.textContent);
const toggleHideLow = () => fireEvent.click(screen.getByRole("switch"));

describe("FindingsPanel severity counters", () => {
  it("shows a chip per level in fixed order, counting dismissed findings", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    const group = screen.getByRole("group", { name: "Filter by severity" });
    const labels = within(group).getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(["1 CRITICAL", "3 WARNING", "1 SUGGESTION"]);
    for (const b of within(group).getAllByRole("button")) {
      expect(b).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("does not render a level with zero findings", () => {
    renderWithIntl(
      <FindingsPanel findings={RUN.filter((f) => f.severity !== "CRITICAL")} prId="pr1" />,
    );
    expect(screen.queryByRole("button", { name: /CRITICAL/ })).toBeNull();
    expect(chip("3 WARNING")).toBeInTheDocument();
  });

  it("click filters to that level; clicking again restores the full list", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    fireEvent.click(chip("3 WARNING"));
    expect(chip("3 WARNING")).toHaveAttribute("aria-pressed", "true");
    expect(titles()).toEqual(["title-w1", "title-w2", "title-w3"]);
    // the filter doesn't change the other counts
    expect(chip("1 CRITICAL")).toBeInTheDocument();

    fireEvent.click(chip("3 WARNING"));
    expect(chip("3 WARNING")).toHaveAttribute("aria-pressed", "false");
    expect(titles()).toHaveLength(5);
  });

  it("only one level is active; clicking another moves the highlight", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    fireEvent.click(chip("3 WARNING"));
    fireEvent.click(chip("1 CRITICAL"));
    expect(chip("1 CRITICAL")).toHaveAttribute("aria-pressed", "true");
    expect(chip("3 WARNING")).toHaveAttribute("aria-pressed", "false");
    expect(titles()).toEqual(["title-c1"]);
  });

  it("combines with Hide low confidence: counts and list both drop low findings", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    fireEvent.click(chip("3 WARNING"));
    toggleHideLow();
    expect(chip("2 WARNING")).toHaveAttribute("aria-pressed", "true");
    expect(titles()).toEqual(["title-w1", "title-w3"]);
  });

  it("keeps an active level visible at 0 with the empty state, then hides it when cleared", () => {
    const run = [mk("c1", "CRITICAL", { confidence: 0.4 }), mk("w1", "WARNING")];
    renderWithIntl(<FindingsPanel findings={run} prId="pr1" />);
    fireEvent.click(chip("1 CRITICAL"));
    toggleHideLow();
    expect(chip("0 CRITICAL")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("No findings match")).toBeInTheDocument();

    fireEvent.click(chip("0 CRITICAL"));
    expect(screen.queryByRole("button", { name: /CRITICAL/ })).toBeNull();
    expect(titles()).toEqual(["title-w1"]);
  });

  it("hides an inactive level that drops to 0 after Hide low confidence", () => {
    const run = [mk("c1", "CRITICAL", { confidence: 0.4 }), mk("w1", "WARNING")];
    renderWithIntl(<FindingsPanel findings={run} prId="pr1" />);
    toggleHideLow();
    expect(screen.queryByRole("button", { name: /CRITICAL/ })).toBeNull();
    expect(chip("1 WARNING")).toBeInTheDocument();
  });

  it("recomputes from refetched findings after accept/dismiss", () => {
    const { rerender } = renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    const dismissed = RUN.map((f) => (f.id === "w1" ? { ...f, dismissed_at: "2026-11-22T01:00:00Z" } : f));
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPanel findings={dismissed} prId="pr1" />
      </NextIntlClientProvider>,
    );
    expect(chip("3 WARNING")).toBeInTheDocument();
    expect(titles()).toHaveLength(5);

    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPanel findings={dismissed.filter((f) => f.id !== "w1")} prId="pr1" />
      </NextIntlClientProvider>,
    );
    expect(chip("2 WARNING")).toBeInTheDocument();
    expect(titles()).toHaveLength(4);
  });

  it("renders no chip group for a run without findings", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("group")).toBeNull();
  });
});

describe("FindingsPanel keyboard focus", () => {
  afterEach(() => mutate.mockReset());

  it("resets j/k focus to the first shown card when a filter changes", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "j" }); // focus on the 3rd card
    fireEvent.click(chip("3 WARNING")); // filter → focus back to the 1st shown
    fireEvent.keyDown(window, { key: "a" });
    expect(mutate).toHaveBeenCalledWith({ findingId: "w1", action: "accept", prId: "pr1" });
  });

  it("resets focus when Hide low confidence toggles", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    fireEvent.keyDown(window, { key: "j" });
    toggleHideLow();
    fireEvent.keyDown(window, { key: "d" });
    expect(mutate).toHaveBeenCalledWith({ findingId: titles()[0]!.replace("title-", ""), action: "dismiss", prId: "pr1" });
  });
});
