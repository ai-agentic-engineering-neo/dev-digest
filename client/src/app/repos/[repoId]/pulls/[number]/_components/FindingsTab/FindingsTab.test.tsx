/**
 * Smart Diff → Findings cross-tab navigation: FindingsTab resolves a
 * `targetFindingId` (set by PrDetailView when a Diff-tab findings badge is
 * clicked) to the review run that owns that finding, then forwards the
 * resolved targetRunId/targetNonce to every ReviewRunAccordion (each
 * accordion decides for itself whether its own run_id matches). This test
 * isolates that resolution logic — the untested part — from the accordion's
 * own DOM/scroll behaviour, which is mocked out.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReviewRecord } from "@devdigest/shared";
import { FindingsTab } from "./FindingsTab";

vi.mock("../ReviewRunAccordion", () => ({
  ReviewRunAccordion: ({
    review,
    targetRunId,
    targetNonce,
  }: {
    review: ReviewRecord;
    targetRunId: string | null;
    targetNonce: number;
  }) => (
    <div data-testid={`run-${review.run_id}`}>
      targetRunId={String(targetRunId)} targetNonce={targetNonce}
    </div>
  ),
}));

afterEach(cleanup);

function finding(id: string, overrides: Partial<ReviewRecord["findings"][number]> = {}) {
  return {
    id,
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "src/foo.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    confidence: 0.9,
    review_id: "review-1",
    accepted_at: null,
    dismissed_at: null,
  } as ReviewRecord["findings"][number];
}

function review(o: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "review-1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security",
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    grounding: null,
    created_at: "2026-06-11T18:44:34.000Z",
    findings: [],
    ...o,
  };
}

const CANCEL_MUTATION = { isPending: false, mutate: vi.fn() } as any;

describe("FindingsTab — Smart Diff → Findings cross-tab navigation", () => {
  it("resolves targetFindingId to the run that owns it (run-2, not the run finding f1 belongs to)", () => {
    const run1 = review({ id: "review-1", run_id: "run-1", findings: [finding("f1")] });
    const run2 = review({ id: "review-2", run_id: "run-2", findings: [finding("f2")] });

    render(
      <FindingsTab
        prId="pr1"
        liveRunIds={[]}
        reviewRunning={false}
        lethalTrifecta={[]}
        runs={[run1, run2]}
        prRuns={[]}
        prCommits={[]}
        cancelMutation={CANCEL_MUTATION}
        targetFindingId="f2"
        targetFindingNonce={1}
        onOpenTrace={() => {}}
        onDelete={() => {}}
        onRunDone={() => {}}
      />,
    );

    expect(screen.getByTestId("run-run-1")).toHaveTextContent("targetRunId=run-2 targetNonce=1");
    expect(screen.getByTestId("run-run-2")).toHaveTextContent("targetRunId=run-2 targetNonce=1");
  });

  it("re-triggers the scroll (bumps targetNonce) on a repeat click of the same finding", () => {
    const run1 = review({ id: "review-1", run_id: "run-1", findings: [finding("f1")] });

    const { rerender } = render(
      <FindingsTab
        prId="pr1"
        liveRunIds={[]}
        reviewRunning={false}
        lethalTrifecta={[]}
        runs={[run1]}
        prRuns={[]}
        prCommits={[]}
        cancelMutation={CANCEL_MUTATION}
        targetFindingId="f1"
        targetFindingNonce={1}
        onOpenTrace={() => {}}
        onDelete={() => {}}
        onRunDone={() => {}}
      />,
    );
    expect(screen.getByTestId("run-run-1")).toHaveTextContent("targetRunId=run-1 targetNonce=1");

    rerender(
      <FindingsTab
        prId="pr1"
        liveRunIds={[]}
        reviewRunning={false}
        lethalTrifecta={[]}
        runs={[run1]}
        prRuns={[]}
        prCommits={[]}
        cancelMutation={CANCEL_MUTATION}
        targetFindingId="f1"
        targetFindingNonce={2}
        onOpenTrace={() => {}}
        onDelete={() => {}}
        onRunDone={() => {}}
      />,
    );
    expect(screen.getByTestId("run-run-1")).toHaveTextContent("targetRunId=run-1 targetNonce=2");
  });

  it("leaves every run untargeted when targetFindingId matches no finding", () => {
    const run1 = review({ id: "review-1", run_id: "run-1", findings: [finding("f1")] });

    render(
      <FindingsTab
        prId="pr1"
        liveRunIds={[]}
        reviewRunning={false}
        lethalTrifecta={[]}
        runs={[run1]}
        prRuns={[]}
        prCommits={[]}
        cancelMutation={CANCEL_MUTATION}
        targetFindingId="does-not-exist"
        targetFindingNonce={1}
        onOpenTrace={() => {}}
        onDelete={() => {}}
        onRunDone={() => {}}
      />,
    );
    expect(screen.getByTestId("run-run-1")).toHaveTextContent("targetRunId=null");
  });
});
