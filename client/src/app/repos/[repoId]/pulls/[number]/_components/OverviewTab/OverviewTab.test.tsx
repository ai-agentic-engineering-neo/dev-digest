import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import type { ReviewRecord, FindingRecord } from "@devdigest/shared";

// IntentCard/BlastRadiusCard (rendered unconditionally in the grid) call
// these hooks — stub them so they render their empty states without needing
// a real QueryClient.
vi.mock("../../../../../../../lib/hooks/intent", () => ({
  usePrIntent: () => ({ data: null, isLoading: false }),
  useComputeIntent: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../../../../../lib/hooks/blast-radius", () => ({
  useBlastRadius: () => ({ data: null, isLoading: false }),
}));

import { OverviewTab } from "./OverviewTab";

afterEach(cleanup);

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    review_id: "rev1",
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: null,
    trifecta_components: null,
    evidence: null,
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function review(o: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rev1",
    pr_id: "pr-1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "Found issues.",
    score: 42,
    model: "gpt-4.1",
    grounding: "2/2 passed",
    created_at: new Date().toISOString(),
    findings: [],
    ...o,
  };
}

function renderTab(props: Partial<React.ComponentProps<typeof OverviewTab>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <OverviewTab
        prBody={null}
        prId="pr-1"
        repoFullName="acme/payments-api"
        headSha="a1b2c3d4"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("OverviewTab", () => {
  it("shows the verdict banner with blockers counted from non-dismissed CRITICAL findings, plus the intent/blast-radius grid and description", () => {
    renderTab({
      prBody: "This PR adds rate limiting.",
      reviews: [
        review({
          findings: [
            finding({ id: "f1", severity: "CRITICAL", dismissed_at: null }),
            finding({ id: "f2", severity: "CRITICAL", dismissed_at: "2026-01-01T00:00:00Z" }), // dismissed — not a blocker
            finding({ id: "f3", severity: "WARNING", dismissed_at: null }),
          ],
        }),
      ],
    });

    expect(screen.getByText("PR Brief")).toBeInTheDocument();
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText(/3 findings · 1 blockers/)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();

    expect(screen.getByText("Intent")).toBeInTheDocument();
    expect(screen.getByText("Blast radius")).toBeInTheDocument();

    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("This PR adds rate limiting.")).toBeInTheDocument();
  });

  it("omits the verdict banner and description when there is no verdicted review or PR body, but still renders the intent/blast-radius grid", () => {
    renderTab({ prBody: null, reviews: [] });

    expect(screen.queryByText("PR Brief")).not.toBeInTheDocument();
    expect(screen.queryByText("Description")).not.toBeInTheDocument();

    expect(screen.getByText("Intent")).toBeInTheDocument();
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
  });
});
