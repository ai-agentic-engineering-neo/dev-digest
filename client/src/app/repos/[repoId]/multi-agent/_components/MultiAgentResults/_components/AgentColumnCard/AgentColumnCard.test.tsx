import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import messages from "@/../messages/en/runs.json";
import type { AgentColumnView, SelectedAgent } from "../../../../types";
import { AgentColumnCard } from "./AgentColumnCard";

afterEach(cleanup);

const AGENT: SelectedAgent = { id: "a1", name: "Security", model: "m", colorIndex: 2 };

function finding(id: string, title: string): FindingRecord {
  return {
    id,
    severity: "CRITICAL",
    category: "security",
    title,
    file: "src/a.ts",
    start_line: 10,
    end_line: 10,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
  };
}

function makeRun(over: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: "run1",
    agent_id: "a1",
    agent_name: "Security",
    provider: null,
    model: null,
    status: "done",
    error: null,
    duration_ms: 8240,
    tokens_in: null,
    tokens_out: null,
    cost_usd: 0.014,
    findings_count: 3,
    grounding: null,
    ran_at: null,
    score: 82,
    blockers: null,
    ...over,
  };
}

interface CardProps {
  visible?: FindingRecord[];
  filtered?: boolean;
  onViewTrace?: (id: string) => void;
  onRetry?: (id: string) => void;
}

function renderCard(column: AgentColumnView, props: CardProps = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div role="list">
        <AgentColumnCard
          column={column}
          visibleFindings={props.visible ?? column.findings}
          filtered={props.filtered ?? false}
          onViewTrace={props.onViewTrace ?? vi.fn()}
          onRetry={props.onRetry ?? vi.fn()}
        />
      </div>
    </NextIntlClientProvider>,
  );
}

describe("AgentColumnCard", () => {
  it("done: shows findings and score, opens the trace; filtered footer counts shown of total", () => {
    const onViewTrace = vi.fn();
    const findings = [finding("f1", "SQL injection"), finding("f2", "Weak hash"), finding("f3", "Open CORS")];
    const review: ReviewRecord = {
      id: "rv1",
      pr_id: "pr1",
      agent_id: "a1",
      run_id: "run1",
      kind: "review",
      verdict: null,
      summary: null,
      score: 82,
      model: null,
      created_at: "2026-01-01T00:00:00Z",
      findings,
    };
    const column: AgentColumnView = { agent: AGENT, state: { kind: "done", run: makeRun(), review }, findings };

    renderCard(column, { visible: findings.slice(0, 1), filtered: true, onViewTrace });

    expect(screen.getByText("SQL injection")).toBeInTheDocument();
    expect(screen.queryByText("Weak hash")).not.toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 findings")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View trace" }));
    expect(onViewTrace).toHaveBeenCalledWith("run1");
  });

  it("failed: shows the error and no score", () => {
    const column: AgentColumnView = {
      agent: AGENT,
      state: { kind: "failed", run: makeRun({ status: "failed", error: "LLM timeout", score: null }) },
      findings: [],
    };
    renderCard(column);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("LLM timeout")).toBeInTheDocument();
    expect(screen.queryByText("82")).not.toBeInTheDocument();
  });

  it("failed to start: shows the message and Retry calls back with the agent id", () => {
    const onRetry = vi.fn();
    const column: AgentColumnView = {
      agent: AGENT,
      state: { kind: "failed_to_start", error: "Rate limited" },
      findings: [],
    };
    renderCard(column, { onRetry });
    expect(screen.getByText("Failed to start")).toBeInTheDocument();
    expect(screen.getByText("Rate limited")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledWith("a1");
  });

  it("failed to start with no server message shows the translated 'no run started' text", () => {
    const column: AgentColumnView = {
      agent: AGENT,
      state: { kind: "failed_to_start", error: null },
      findings: [],
    };
    renderCard(column);
    expect(screen.getByText("No run was started for this agent")).toBeInTheDocument();
  });
});
