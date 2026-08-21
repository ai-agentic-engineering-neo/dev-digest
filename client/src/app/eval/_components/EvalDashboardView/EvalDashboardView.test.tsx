import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalDashboard } from "@devdigest/shared/contracts/eval-ci";
import evalMessages from "../../../../../messages/en/eval.json";
import shellMessages from "../../../../../messages/en/shell.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/eval",
}));

let DASHBOARD: EvalDashboard = { agents: [], recent_runs: [] };
const runAllMutate = vi.fn();

vi.mock("@/lib/hooks/eval", () => ({
  useEvalDashboard: () => ({ data: DASHBOARD, isLoading: false, isError: false, refetch: vi.fn() }),
  useRunAllEvals: () => ({ mutate: runAllMutate, isPending: false, data: undefined }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { EvalDashboardView } from "./EvalDashboardView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, shell: shellMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("EvalDashboardView", () => {
  it("shows the empty state when no agent has eval cases", () => {
    DASHBOARD = { agents: [], recent_runs: [] };
    renderWithIntl(<EvalDashboardView />);
    expect(screen.getByRole("heading", { name: evalMessages.dashboard.defaultTitle })).toBeInTheDocument();
    expect(screen.getByText(evalMessages.dashboard.perAgentNote)).toBeInTheDocument();
  });

  it("lists every agent with cases and its latest metrics (AC-40)", () => {
    DASHBOARD = {
      agents: [
        {
          agent_id: "agent-1",
          agent_name: "Security Reviewer",
          cases_total: 8,
          latest: {
            id: "run-1",
            owner_kind: "agent",
            owner_id: "agent-1",
            agent_name: "Security Reviewer",
            status: "completed",
            started_at: "2026-01-01T00:00:00.000Z",
            finished_at: "2026-01-01T00:01:00.000Z",
            agent_version: 1,
            case_ids: ["c1"],
            metrics: {
              recall: 0.8,
              precision: 0.9,
              citation_accuracy: 1,
              traces_passed: 6,
              traces_total: 8,
              cases_errored: 0,
              duration_ms: 1000,
              cost_usd: 0.05,
              per_case: [],
            },
            duration_ms: 1000,
            cost_usd: 0.05,
            error_reason: null,
          },
          trend: [],
        },
      ],
      recent_runs: [],
    };
    renderWithIntl(<EvalDashboardView />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("6/8")).toBeInTheDocument();
  });

  it("opens the run-all confirmation dialog stating the total execution count (AC-25)", () => {
    DASHBOARD = {
      agents: [
        { agent_id: "a1", agent_name: "Agent One", cases_total: 3, latest: null, trend: [] },
        { agent_id: "a2", agent_name: "Agent Two", cases_total: 5, latest: null, trend: [] },
      ],
      recent_runs: [],
    };
    renderWithIntl(<EvalDashboardView />);
    fireEvent.click(screen.getByRole("button", { name: evalMessages.run.confirmAll.trigger }));
    expect(screen.getByText(evalMessages.run.confirmAll.title)).toBeInTheDocument();
    expect(screen.getByText(/8 case executions/)).toBeInTheDocument();
  });
});
