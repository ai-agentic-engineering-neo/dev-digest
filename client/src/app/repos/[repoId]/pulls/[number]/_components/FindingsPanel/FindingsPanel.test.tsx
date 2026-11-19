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

  describe("severity counters", () => {
    const mk = (id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord => ({
      ...FINDINGS[0]!,
      id,
      severity,
      confidence,
      title: `Title ${id}`,
    });
    const MIXED = [mk("a", "CRITICAL"), mk("b", "CRITICAL", 0.5), mk("c", "WARNING")];
    const btn = (name: RegExp) => screen.getByRole("button", { name });

    it("shows counts per level, 0 for empty", () => {
      renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
      expect(btn(/2\s*CRITICAL/)).toBeInTheDocument();
      expect(btn(/1\s*WARNING/)).toBeInTheDocument();
      expect(btn(/0\s*SUGGESTION/)).toBeInTheDocument();
    });

    it("filters on click, moves on another level, clears on second click", () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      mutate.mockClear();
      renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);

      fireEvent.click(btn(/CRITICAL/));
      expect(btn(/CRITICAL/)).toHaveAttribute("aria-pressed", "true");
      expect(screen.queryByText("Title c")).not.toBeInTheDocument();
      expect(screen.getByText("Title a")).toBeInTheDocument();

      fireEvent.click(btn(/WARNING/));
      expect(btn(/WARNING/)).toHaveAttribute("aria-pressed", "true");
      expect(btn(/CRITICAL/)).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByText("Title c")).toBeInTheDocument();
      expect(screen.queryByText("Title a")).not.toBeInTheDocument();

      fireEvent.click(btn(/WARNING/));
      expect(screen.getByText("Title a")).toBeInTheDocument();
      expect(screen.getByText("Title b")).toBeInTheDocument();
      expect(screen.getByText("Title c")).toBeInTheDocument();
      for (const n of [/CRITICAL/, /WARNING/, /SUGGESTION/]) {
        expect(btn(n)).toHaveAttribute("aria-pressed", "false");
      }

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mutate).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it("combines with Hide low confidence", () => {
      renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
      fireEvent.click(btn(/CRITICAL/));
      expect(screen.getByText("Title b")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("switch"));
      expect(screen.queryByText("Title b")).not.toBeInTheDocument();
      expect(screen.getByText("Title a")).toBeInTheDocument();
      expect(btn(/1\s*CRITICAL/)).toBeInTheDocument();
    });

    it("shows the empty state for a level with no findings", () => {
      renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
      fireEvent.click(btn(/SUGGESTION/));
      expect(screen.getByText("No findings match")).toBeInTheDocument();
    });
  });
});
