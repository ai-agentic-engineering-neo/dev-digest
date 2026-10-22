/** FindingsTab — the PR-level severity bar filters findings across every review run. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useRunEvents: () => ({}),
}));

import { FindingsTab } from "./FindingsTab";

afterEach(cleanup);

const finding = (id: string, severity: FindingRecord["severity"], title: string): FindingRecord => ({
  id,
  severity,
  category: "bug",
  title,
  file: "src/a.ts",
  start_line: 1,
  end_line: 1,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r",
  accepted_at: null,
  dismissed_at: null,
});

const review = (id: string, findings: FindingRecord[]): ReviewRecord => ({
  id,
  pr_id: "pr1",
  agent_id: null,
  run_id: `run-${id}`,
  agent_name: `Agent ${id}`,
  kind: "review",
  verdict: null,
  summary: null,
  score: null,
  model: null,
  created_at: "2026-10-10T00:00:00Z",
  findings,
});

const RUNS = [
  review("a", [finding("a1", "CRITICAL", "Secret in config"), finding("a2", "WARNING", "N+1 query")]),
  review("b", [finding("b1", "SUGGESTION", "Magic number")]),
];

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsTab
        prId="pr1"
        liveRunIds={[]}
        reviewRunning={false}
        lethalTrifecta={[]}
        runs={RUNS}
        prRuns={[]}
        prCommits={[]}
        cancelMutation={{ mutate: vi.fn(), isPending: false } as never}
        onOpenTrace={() => {}}
        onDelete={() => {}}
        onRunDone={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

describe("FindingsTab — severity filter", () => {
  it("clicking a level shows only its findings (other runs hidden); clicking again resets", () => {
    renderTab();
    const crit = screen.getByRole("button", { name: "Show only Critical findings (1)" });
    fireEvent.click(crit);
    expect(screen.getByText("Secret in config")).toBeInTheDocument();
    expect(screen.queryByText("N+1 query")).not.toBeInTheDocument();
    expect(screen.queryByText("Agent b")).not.toBeInTheDocument();
    expect(screen.getByText("Showing critical findings only")).toBeInTheDocument();

    fireEvent.click(crit);
    expect(screen.getByText("Agent b")).toBeInTheDocument();
    expect(screen.queryByText("Showing critical findings only")).not.toBeInTheDocument();
  });

  it("'Show all' clears the filter", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Show only Suggestion findings (1)" }));
    expect(screen.queryByText("Agent a")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByText("Agent a")).toBeInTheDocument();
  });
});
