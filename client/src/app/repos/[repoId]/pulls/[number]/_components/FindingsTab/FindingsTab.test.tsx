import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsTab } from "./FindingsTab";

afterEach(cleanup);

const review = (n: number): ReviewRecord => ({
  id: `rev${n}`,
  pr_id: "pr1",
  agent_id: "a1",
  run_id: `run${n}`,
  agent_name: `Agent ${n}`,
  kind: "review",
  verdict: "comment",
  summary: `Summary of run ${n}`,
  score: 80,
  model: null,
  created_at: "2026-06-11T18:44:34.000Z",
  findings: [],
});

const runSummary = (n: number): RunSummary => ({
  run_id: `run${n}`,
  agent_id: "a1",
  agent_name: `Agent ${n}`,
  provider: "openrouter",
  model: "m",
  status: "done",
  error: null,
  duration_ms: 1,
  tokens_in: 1,
  tokens_out: 1,
  cost_usd: null,
  findings_count: 0,
  grounding: "0/0 passed",
  ran_at: `2026-06-11T18:44:0${n}.000Z`,
  score: null,
  blockers: null,
});

function tab(runs: ReviewRecord[]) {
  return (
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsTab
        prId="pr1"
        liveRunIds={[]}
        reviewRunning={false}
        lethalTrifecta={[]}
        runs={runs}
        prRuns={runs.map((_, i) => runSummary(i + 1))}
        prCommits={[]}
        cancelMutation={{ mutate: vi.fn(), isPending: false }}
        onOpenTrace={vi.fn()}
        onDelete={vi.fn()}
        onRunDone={vi.fn()}
      />
    </NextIntlClientProvider>
  );
}

describe("FindingsTab review runs", () => {
  it("opens the newest run by default; the Timeline opens and scrolls to another, every click", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    // Newest first.
    render(tab([review(2), review(1)]));
    expect(screen.getByText("Summary of run 2")).toBeInTheDocument();
    expect(screen.queryByText("Summary of run 1")).not.toBeInTheDocument();

    // The Timeline lists newest first, so the second link is run 1.
    const run1Link = screen.getAllByTitle("Jump to this run’s findings below")[1]!;
    fireEvent.click(run1Link);
    fireEvent.click(run1Link);
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Summary of run 1")).toBeInTheDocument();
  });

  it("keeps a run open when a newer run arrives", () => {
    const { rerender } = render(tab([review(1)]));
    expect(screen.getByText("Summary of run 1")).toBeInTheDocument();

    rerender(tab([review(2), review(1)]));
    expect(screen.getByText("Summary of run 2")).toBeInTheDocument();
    expect(screen.getByText("Summary of run 1")).toBeInTheDocument();
  });
});
