/**
 * FindingsTab — M1: each review's VerdictBanner shows the cost · tokens of the
 * run that produced it, matched by `review.run_id` against the PR's run history.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
  useRunEvents: () => ({ events: [], running: false }),
}));

import { FindingsTab } from "./FindingsTab";

afterEach(cleanup);

function review(o: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rev-1",
    pr_id: "pr-1",
    agent_id: "a1",
    run_id: "r-new",
    agent_name: "General Reviewer",
    kind: "review",
    verdict: "comment",
    summary: "Looks fine.",
    score: 80,
    model: "deepseek/deepseek-v4-flash",
    grounding: "0/0 passed",
    created_at: "2026-11-19T10:00:00.000Z",
    findings: [],
    ...o,
  };
}

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "r-new",
    agent_id: "a1",
    agent_name: "General Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1800,
    tokens_in: 8200,
    tokens_out: 1300,
    cost_usd: 0.014,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-11-19T10:00:00.000Z",
    score: 80,
    blockers: 0,
    ...o,
  };
}

function renderTab(reviews: ReviewRecord[], prRuns: RunSummary[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsTab
        prId="pr-1"
        liveRunIds={[]}
        reviewRunning={false}
        lethalTrifecta={[]}
        runs={reviews}
        prRuns={prRuns}
        prCommits={[]}
        cancelMutation={{ mutate: vi.fn(), isPending: false } as never}
        onOpenTrace={() => {}}
        onDelete={() => {}}
        onRunDone={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

/** The VerdictBanner uses the `full` variant — the only badge with a tokens arrow. */
function bannerCostTexts(): string[] {
  return screen
    .queryAllByTestId("run-cost-badge")
    .map((el) => el.textContent ?? "")
    .filter((txt) => txt.includes("→"));
}

describe("FindingsTab — VerdictBanner cost comes from the review's own run", () => {
  it("matches the run by review.run_id (not the first/latest run in the list)", () => {
    renderTab(
      [review({ run_id: "r-new" })],
      [
        run({ run_id: "r-other", cost_usd: 0.5, tokens_in: 50_000, tokens_out: 4_000, ran_at: "2026-11-19T11:00:00.000Z" }),
        run({ run_id: "r-new", cost_usd: 0.014, tokens_in: 8200, tokens_out: 1300 }),
      ],
    );
    expect(bannerCostTexts()).toEqual(["$0.014 · 8.2K→1.3K"]);
  });

  it("renders no cost line when the review's run is not in the history (e.g. deleted)", () => {
    renderTab([review({ run_id: "r-gone" })], [run({ run_id: "r-other", cost_usd: 0.5 })]);
    expect(bannerCostTexts()).toEqual([]);
  });

  it("matched run without cost data shows an em dash, not $0.00", () => {
    renderTab([review({ run_id: "r-new" })], [run({ run_id: "r-new", cost_usd: null })]);
    expect(bannerCostTexts()).toEqual(["— · 8.2K→1.3K"]);
  });
});
