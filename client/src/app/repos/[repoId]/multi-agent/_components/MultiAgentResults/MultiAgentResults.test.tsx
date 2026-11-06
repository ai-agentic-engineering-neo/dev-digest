import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import runsMessages from "../../../../../../../messages/en/runs.json";
import prReviewMessages from "../../../../../../../messages/en/prReview.json";
import type { SelectedAgent, StartStates } from "../../types";

let currentRuns: RunSummary[] = [];
let currentReviews: ReviewRecord[] = [];
let runsError = false;
const refetchRuns = vi.fn();

vi.mock("@/lib/hooks/reviews", () => ({
  usePrRuns: () => ({ data: runsError ? undefined : currentRuns, isLoading: false, isError: runsError, refetch: refetchRuns }),
  usePrReviews: () => ({ data: currentReviews, isLoading: false, isError: false, refetch: vi.fn() }),
  useRunEvents: () => ({ events: [], running: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: undefined, isLoading: true }),
}));

import { MultiAgentResults } from "./MultiAgentResults";

afterEach(() => {
  cleanup();
  currentRuns = [];
  currentReviews = [];
  runsError = false;
  refetchRuns.mockClear();
});

const PR = { id: "pr1", number: 42, title: "Fix auth" };

function agent(id: string, name: string, colorIndex: number): SelectedAgent {
  return { id, name, model: "m", colorIndex };
}
const A1 = agent("a1", "Security", 1);
const A2 = agent("a2", "Perf", 2);
const A3 = agent("a3", "Style", 3);

function run(over: Partial<RunSummary>): RunSummary {
  return {
    run_id: "r",
    agent_id: "a1",
    agent_name: "x",
    provider: null,
    model: null,
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: null,
    tokens_out: null,
    cost_usd: null,
    findings_count: 0,
    grounding: null,
    ran_at: null,
    score: null,
    blockers: null,
    ...over,
  };
}

function finding(id: string, title: string, file: string, line: number, severity: FindingRecord["severity"]): FindingRecord {
  return {
    id,
    severity,
    category: "security",
    title,
    file,
    start_line: line,
    end_line: line,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv",
    accepted_at: null,
    dismissed_at: null,
  };
}

function review(runId: string, agentId: string, score: number, findings: FindingRecord[]): ReviewRecord {
  return {
    id: `rv-${runId}`,
    pr_id: "pr1",
    agent_id: agentId,
    run_id: runId,
    kind: "review",
    verdict: null,
    summary: null,
    score,
    model: null,
    created_at: "2026-01-01T00:00:00Z",
    findings,
  };
}

function ui(props: { agents?: SelectedAgent[]; view?: "columns" | "tabs"; startStates?: StartStates; onConfigure?: () => void }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ runs: runsMessages, prReview: prReviewMessages }}>
        <MultiAgentResults
          pr={PR}
          agents={props.agents ?? [A1, A2, A3]}
          view={props.view ?? "columns"}
          startStates={props.startStates ?? {}}
          onRetry={vi.fn()}
          onConfigure={props.onConfigure ?? vi.fn()}
          onChangeView={vi.fn()}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

function seedThreeAgents() {
  const f1 = finding("f1", "SQL injection", "src/a.ts", 10, "CRITICAL");
  const f3 = finding("f3", "Weak hash", "src/c.ts", 5, "WARNING");
  const f4 = finding("f4", "Weak hash too", "src/c.ts", 5, "WARNING");
  currentRuns = [
    run({ run_id: "old", agent_id: "a1", score: 40, ran_at: "2026-01-01T00:00:00Z", duration_ms: 1000 }),
    run({ run_id: "new", agent_id: "a1", score: 82, ran_at: "2026-01-02T00:00:00Z", duration_ms: 9400 }),
    run({ run_id: "r2", agent_id: "a2", score: 60, ran_at: "2026-01-02T00:00:00Z", duration_ms: 5000 }),
    run({ run_id: "r3", agent_id: "a3", status: "failed", error: "LLM timeout", ran_at: "2026-01-02T00:00:00Z", duration_ms: 2000 }),
  ];
  currentReviews = [review("new", "a1", 82, [f1, f3]), review("r2", "a2", 60, [f4])];
}

describe("MultiAgentResults", () => {
  it("uses the newest run, excludes failed columns from conflicts, shows totals and no stale copy", () => {
    seedThreeAgents();
    render(ui({}));

    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.queryByText("40")).not.toBeInTheDocument();
    expect(screen.getByText("3 agents · 9.4s total")).toBeInTheDocument();
    expect(screen.getByText("LLM timeout")).toBeInTheDocument();
    expect(screen.queryByText(/worktree|p-queue/i)).not.toBeInTheDocument();
    // only the two finished agents are compared: one conflict (a.ts), c.ts is agreed on
    const conflicts = screen.getByRole("region", { name: "Where agents disagree" });
    expect(within(conflicts).getByText("src/a.ts:10")).toBeInTheDocument();
    expect(within(conflicts).queryByText(/src\/c\.ts/)).not.toBeInTheDocument();
  });

  it("shows an em dash cost in the meta row when no run has a cost", () => {
    seedThreeAgents();
    render(ui({}));

    const metaRow = screen.getByText("3 agents · 9.4s total").parentElement as HTMLElement;
    expect(within(metaRow).getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/worktree|p-queue/i)).not.toBeInTheDocument();
  });

  it("gives a failed agent no take in conflicts, and shows its error without a score", () => {
    seedThreeAgents();
    render(ui({}));

    const section = screen.getByRole("heading", { name: "Where agents disagree" }).closest("section") as HTMLElement;
    expect(within(section).getAllByText(/src\/a\.ts/).length).toBeGreaterThan(0);
    expect(within(section).getByText("Security")).toBeInTheDocument();
    expect(within(section).getByText("Perf")).toBeInTheDocument();
    expect(within(section).queryByText("Style")).not.toBeInTheDocument();
    // only Perf did not flag; the failed Style agent adds no "did not flag"
    expect(within(section).getAllByText("did not flag")).toHaveLength(1);

    const failedCard = screen.getByText("LLM timeout").closest('[role="listitem"]') as HTMLElement;
    expect(within(failedCard).getByText("Style")).toBeInTheDocument();
    expect(within(failedCard).getByText("Failed")).toBeInTheDocument();
    expect(within(failedCard).queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it("filters findings to conflicts and restores them", () => {
    seedThreeAgents();
    render(ui({}));

    expect(screen.getByText("Weak hash")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByText("Weak hash")).not.toBeInTheDocument();
    expect(screen.getAllByText("SQL injection").length).toBeGreaterThan(0);
    expect(screen.getByText("1 of 2 findings")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("Weak hash")).toBeInTheDocument();
  });

  it("turns a running column done when its review arrives, and opens the trace drawer", () => {
    currentRuns = [run({ run_id: "new", agent_id: "a1", status: "running", duration_ms: null })];
    const { rerender } = render(ui({ agents: [A1] }));
    expect(screen.getByText("Running…")).toBeInTheDocument();

    currentRuns = [run({ run_id: "new", agent_id: "a1", score: 77, duration_ms: 3000 })];
    currentReviews = [review("new", "a1", 77, [])];
    rerender(ui({ agents: [A1] }));
    expect(screen.getByText("77")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View trace" }));
    expect(within(screen.getByRole("dialog")).getByText(/Security/)).toBeInTheDocument();
  });

  it("lays out 7 agents in a scrollable list and 3 agents in 3 columns", () => {
    const seven = Array.from({ length: 7 }, (_, i) => agent(`s${i}`, `Agent ${i}`, (i % 6) + 1));
    const pending: StartStates = Object.fromEntries(seven.map((a) => [a.id, { status: "pending" as const }]));
    const { unmount } = render(ui({ agents: seven, startStates: pending }));
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    expect(list.style.overflowX).toBe("auto");
    expect(list.style.gridAutoFlow).toBe("column");
    unmount();

    seedThreeAgents();
    render(ui({}));
    expect(screen.getAllByRole("list")[0]?.style.gridTemplateColumns).toContain("repeat(3,");
  });

  it("shows the empty state with a Configure run action when nothing ran", () => {
    const onConfigure = vi.fn();
    render(ui({ onConfigure }));
    expect(screen.getByText("No runs for these agents yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Configure run" }));
    expect(onConfigure).toHaveBeenCalled();
  });

  it("shows an error with Retry, not the empty state, when loading runs fails", () => {
    runsError = true;
    render(ui({}));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load the runs");
    expect(screen.queryByText("No runs for these agents yet")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetchRuns).toHaveBeenCalled();
  });
});
