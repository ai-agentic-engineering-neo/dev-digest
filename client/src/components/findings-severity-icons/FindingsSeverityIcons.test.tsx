import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";

const usePrReviewsMock = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (prId: string | null) => usePrReviewsMock(prId),
}));

import { FindingsSeverityIcons } from "./FindingsSeverityIcons";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function finding(severity: FindingRecord["severity"], id: string): FindingRecord {
  return {
    id,
    severity,
    category: "security",
    title: `finding ${id}`,
    file: "f.ts",
    start_line: 1,
    end_line: 1,
    rationale: "because reasons",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

describe("FindingsSeverityIcons", () => {
  it("renders nothing when counts is null", () => {
    usePrReviewsMock.mockReturnValue({ data: undefined });
    const { container } = renderWithIntl(
      <FindingsSeverityIcons counts={null} source={{ kind: "eager", findings: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows counts per severity and the eager finding list on hover", () => {
    usePrReviewsMock.mockReturnValue({ data: undefined });
    const findings = [finding("CRITICAL", "f1"), finding("WARNING", "f2")];
    renderWithIntl(
      <FindingsSeverityIcons
        counts={{ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 }}
        source={{ kind: "eager", findings }}
      />,
    );
    expect(screen.getAllByText("1")).toHaveLength(2);

    fireEvent.mouseOver(screen.getAllByText("1")[0]!);
    expect(screen.getByText("finding f1")).toBeInTheDocument();
    expect(screen.getByText("finding f2")).toBeInTheDocument();
  });

  it("lazily fetches the latest review's findings on first hover (lazy source)", () => {
    const reviews: ReviewRecord[] = [
      {
        id: "rev-old",
        pr_id: "pr1",
        agent_id: "a1",
        run_id: "run-old",
        agent_name: "Old",
        kind: "review",
        verdict: "comment",
        summary: null,
        score: 80,
        model: null,
        grounding: null,
        created_at: "2026-01-01T00:00:00.000Z",
        findings: [finding("SUGGESTION", "old-finding")],
      },
      {
        id: "rev-new",
        pr_id: "pr1",
        agent_id: "a1",
        run_id: "run-new",
        agent_name: "New",
        kind: "review",
        verdict: "request_changes",
        summary: null,
        score: 40,
        model: null,
        grounding: null,
        created_at: "2026-02-01T00:00:00.000Z",
        findings: [finding("CRITICAL", "new-finding")],
      },
    ];
    usePrReviewsMock.mockReturnValue({ data: undefined });

    const { rerender } = renderWithIntl(
      <FindingsSeverityIcons
        counts={{ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }}
        source={{ kind: "lazy", prId: "pr1" }}
      />,
    );
    expect(usePrReviewsMock).toHaveBeenLastCalledWith(null);

    fireEvent.mouseOver(screen.getByText("1"));
    expect(usePrReviewsMock).toHaveBeenLastCalledWith("pr1");

    usePrReviewsMock.mockReturnValue({ data: reviews });
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsSeverityIcons
          counts={{ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }}
          source={{ kind: "lazy", prId: "pr1" }}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.mouseOver(screen.getByText("1"));
    // The latest review (rev-new, newer created_at) wins — not the older one.
    expect(screen.getByText("finding new-finding")).toBeInTheDocument();
    expect(screen.queryByText("finding old-finding")).not.toBeInTheDocument();
  });
});
