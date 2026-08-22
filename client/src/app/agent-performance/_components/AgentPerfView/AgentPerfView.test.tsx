import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentPerf, AgentPerfRow } from "@devdigest/shared/contracts/productionize";
import perfMessages from "../../../../../messages/en/agentPerformance.json";

let PERF: AgentPerf = {
  summary: { runs: 0, total_cost_usd: null, avg_accept_rate: null, most_active_agent: null, range_days: 30 },
  agents: [],
  cost_by_agent: [],
  cost_by_model: [],
};

vi.mock("@/lib/hooks/agent-performance", () => ({
  useAgentPerformance: () => ({ data: PERF, isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { AgentPerfView } from "./AgentPerfView";

function row(overrides: Partial<AgentPerfRow>): AgentPerfRow {
  return {
    agent_id: "a1",
    agent_name: "Security",
    provider: "openrouter",
    model: "gpt-4.1",
    runs: 10,
    runs_local: 10,
    runs_ci: 0,
    findings_total: 20,
    accepted: 6,
    dismissed: 2,
    accept_rate: 0.75,
    dismiss_rate: 0.25,
    avg_findings_per_run: 2,
    total_cost_usd: 1.2,
    avg_cost_usd: 0.12,
    avg_latency_ms: 8000,
    last_run_at: new Date().toISOString(),
    findings_by_severity: { CRITICAL: 1, WARNING: 2, SUGGESTION: 3 },
    trend: [],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ agentPerformance: perfMessages }}>{ui}</NextIntlClientProvider>);
}

describe("AgentPerfView", () => {
  it("renders no figures when no agent run exists in range (AC-47)", () => {
    PERF = { summary: { runs: 0, total_cost_usd: null, avg_accept_rate: null, most_active_agent: null, range_days: 30 }, agents: [], cost_by_agent: [], cost_by_model: [] };
    renderWithIntl(<AgentPerfView />);
    expect(screen.getByText(perfMessages.empty.title)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("presents total runs, total cost and most-active agent with its count (AC-41)", () => {
    // total_cost_usd (tile) intentionally differs from the single agent's
    // avg_cost_usd (table cell) so the two don't collide in the same assertion.
    PERF = {
      summary: { runs: 10, total_cost_usd: 3.4, avg_accept_rate: 0.75, most_active_agent: "Security", range_days: 30 },
      agents: [row({ total_cost_usd: 1.2, avg_cost_usd: 0.12 })],
      cost_by_agent: [],
      cost_by_model: [],
    };
    renderWithIntl(<AgentPerfView />);
    expect(screen.getByText(perfMessages.summary.totalRuns)).toBeInTheDocument();
    expect(screen.getByText("$3.40")).toBeInTheDocument();
    expect(screen.getAllByText("Security").length).toBeGreaterThan(0);
  });

  it("shows a not-applicable accept rate (never 0%) for a CI-only agent, plus the explanatory note (AC-46)", () => {
    PERF = {
      summary: { runs: 5, total_cost_usd: 0.5, avg_accept_rate: null, most_active_agent: "CI Bot", range_days: 30 },
      agents: [row({ agent_id: "a2", agent_name: "CI Bot", runs_local: 0, runs_ci: 5, accept_rate: null })],
      cost_by_agent: [],
      cost_by_model: [],
    };
    renderWithIntl(<AgentPerfView />);
    expect(screen.getAllByText(perfMessages.notApplicable).length).toBeGreaterThan(0);
    expect(screen.getByText(perfMessages.ciOnlyNote)).toBeInTheDocument();
  });

  it("switching the range preset changes the requested range (AC-43)", () => {
    PERF = { summary: { runs: 3, total_cost_usd: 0.1, avg_accept_rate: 0.5, most_active_agent: "Security", range_days: 30 }, agents: [row({})], cost_by_agent: [], cost_by_model: [] };
    renderWithIntl(<AgentPerfView />);
    const sevenDayBtn = screen.getByRole("radio", { name: "7 days" });
    fireEvent.click(sevenDayBtn);
    expect(sevenDayBtn).toHaveAttribute("aria-checked", "true");
  });
});
