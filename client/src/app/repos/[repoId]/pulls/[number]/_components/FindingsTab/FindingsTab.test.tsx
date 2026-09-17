import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsTab } from "./FindingsTab";

afterEach(cleanup);

function finding(severity: FindingRecord["severity"], id: string, title: string): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title,
    file: "f.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
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

const CRITICAL_RUN: ReviewRecord = {
  id: "review-1",
  kind: "review",
  pr_id: "pr1",
  agent_id: "agent-1",
  run_id: "run-1",
  model: "test-model",
  agent_name: "Security Reviewer",
  verdict: "request_changes",
  summary: "s",
  score: 38,
  created_at: new Date().toISOString(),
  findings: [finding("CRITICAL", "f1", "Hardcoded secret")],
};

const WARNING_ONLY_RUN: ReviewRecord = {
  id: "review-2",
  kind: "review",
  pr_id: "pr1",
  agent_id: "agent-2",
  run_id: "run-2",
  model: "test-model",
  agent_name: "Performance Reviewer",
  verdict: "comment",
  summary: "s",
  score: 64,
  created_at: new Date().toISOString(),
  findings: [finding("WARNING", "f2", "N+1 query")],
};

const RUNS = [CRITICAL_RUN, WARNING_ONLY_RUN];
const ALL_FINDINGS = RUNS.flatMap((r) => r.findings);

function renderTab(severityFilter: FindingRecord["severity"] | null) {
  const onSeverityChange = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsTab
        prId="pr1"
        liveRunIds={[]}
        reviewRunning={false}
        lethalTrifecta={[]}
        allFindings={ALL_FINDINGS}
        runs={RUNS}
        prRuns={[]}
        prCommits={[]}
        cancelMutation={{ mutate: vi.fn(), isPending: false } as any}
        severityFilter={severityFilter}
        onSeverityChange={onSeverityChange}
        onOpenTrace={vi.fn()}
        onDelete={vi.fn()}
        onRunDone={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
  return { ...utils, onSeverityChange };
}

describe("FindingsTab severity filtering", () => {
  it("shows both runs and the severity counters when unfiltered", () => {
    renderTab(null);
    expect(screen.getAllByText("Security Reviewer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Performance Reviewer").length).toBeGreaterThan(0);
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("WARNING")).toBeInTheDocument();
  });

  it("filtering to CRITICAL hides the run with no critical findings", () => {
    renderTab("CRITICAL");
    expect(screen.getAllByText("Security Reviewer").length).toBeGreaterThan(0);
    expect(screen.queryByText("Performance Reviewer")).not.toBeInTheDocument();
  });

  it("clicking a severity chip reports the selection to the parent", () => {
    const { onSeverityChange } = renderTab(null);
    fireEvent.click(screen.getByText("WARNING"));
    expect(onSeverityChange).toHaveBeenCalledWith("WARNING");
  });

  it("clicking the active chip clears the filter", () => {
    const { onSeverityChange } = renderTab("CRITICAL");
    fireEvent.click(screen.getByText("CRITICAL"));
    expect(onSeverityChange).toHaveBeenCalledWith(null);
  });

  it("the remaining run under a filter shows only the matching finding (it's open by default)", () => {
    renderTab("CRITICAL");
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });
});
