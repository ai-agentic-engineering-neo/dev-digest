import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import type { AgentStats } from "@devdigest/shared/contracts/observability";
import messages from "../../../../../../../../messages/en/agents.json";
import * as hooks from "@/lib/hooks/agent-performance";
import { StatsTab } from "./StatsTab";

afterEach(cleanup);

const AGENT: Agent = {
  id: "agent-1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "Review.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function mockStats(data: AgentStats | undefined, extra: Partial<ReturnType<typeof hooks.useAgentStats>> = {}) {
  vi.spyOn(hooks, "useAgentStats").mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...extra,
  } as unknown as ReturnType<typeof hooks.useAgentStats>);
}

const BASE: AgentStats = {
  agent_id: "agent-1",
  agent_name: "Security Reviewer",
  runs: 12,
  findings_total: 24,
  accepted: 9,
  dismissed: 3,
  pending: 2,
  accept_rate: 0.75,
  dismiss_rate: 0.25,
  avg_findings_per_run: 2,
  total_cost_usd: 1.44,
  avg_cost_usd: 0.12,
  avg_latency_ms: 8000,
  findings_by_severity: { CRITICAL: 1, WARNING: 2, SUGGESTION: 3 },
  trend: [
    { label: "2026-09-22", value: 5 },
    { label: "2026-09-23", value: 7 },
  ],
  counted_runs: 12,
  costed_runs: 12,
  cost_by_source: { provider: 1.44, estimated: null, unknown: null },
  decisions: 12,
  low_sample: false,
  runs_delta: 3,
  accept_rate_delta: 0.1,
  cost_delta: 0.2,
  range: { from: "2026-08-24T00:00:00.000Z", to: "2026-09-23T00:00:00.000Z" },
};

describe("StatsTab", () => {
  it("renders runs/cost/accept-rate/duration for an agent with runs in the period (AC-1)", () => {
    mockStats(BASE);
    renderWithProviders(<StatsTab agent={AGENT} />);

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("$1.44")).toBeInTheDocument();
    // accept-rate denominator shown alongside the percentage.
    expect(screen.getByText("75% (9/12)")).toBeInTheDocument();
    expect(screen.getByText("8.0s")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
  });

  it("shows the low-sample marker under the low-sample threshold", () => {
    mockStats({ ...BASE, decisions: 4, accepted: 3, dismissed: 1, low_sample: true });
    renderWithProviders(<StatsTab agent={AGENT} />);
    expect(screen.getByText(messages.stats.lowSample)).toBeInTheDocument();
  });

  it("renders a distinct empty state for zero runs in the selected period, never a fabricated 0%/$0.00 tile (AC-4/AC-5)", () => {
    mockStats({
      ...BASE,
      runs: 0,
      findings_total: 0,
      accepted: 0,
      dismissed: 0,
      pending: 0,
      accept_rate: null,
      total_cost_usd: null,
      avg_cost_usd: null,
      avg_latency_ms: null,
      decisions: 0,
      trend: [],
      runs_delta: null,
      accept_rate_delta: null,
      cost_delta: null,
      cost_by_source: { provider: null, estimated: null, unknown: null },
    });
    renderWithProviders(<StatsTab agent={AGENT} />);
    expect(screen.getByText(messages.stats.empty.title)).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("shows the loading skeleton with no digits, then the error state with a retry, never invented digits", () => {
    const refetch = vi.fn();
    mockStats(undefined, { isLoading: true, refetch });
    const { unmount } = renderWithProviders(<StatsTab agent={AGENT} />);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    unmount();

    mockStats(undefined, { isLoading: false, isError: true, refetch });
    renderWithProviders(<StatsTab agent={AGENT} />);
    expect(screen.getByText(messages.stats.loadError)).toBeInTheDocument();
  });
});
