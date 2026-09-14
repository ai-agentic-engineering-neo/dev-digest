import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ApiError } from "@/lib/api";
import runsMessages from "../../../../../../../../messages/en/runs.json";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo-1", prId: "pr-1" }),
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "repo-1", full_name: "acme/demo" } }),
  useRepoNotFound: () => false,
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/repo-not-found", () => ({
  RepoNotFound: () => <div>repo not found</div>,
}));

const { useMultiAgentRunMock } = vi.hoisted(() => ({ useMultiAgentRunMock: vi.fn() }));
vi.mock("@/lib/hooks/multi-agent", () => ({
  useMultiAgentRun: useMultiAgentRunMock,
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [] }),
}));
vi.mock("@/lib/hooks/core", () => ({
  usePullDetail: () => ({ data: { head_sha: "sha1" } }),
}));

vi.mock("@/components/run-trace-drawer/RunTraceDrawer", () => ({
  default: () => <div>trace-drawer</div>,
}));
vi.mock("./ColumnsLayout", () => ({
  ColumnsLayout: () => <div>columns-layout</div>,
}));
vi.mock("./TabsLayout", () => ({
  TabsLayout: () => <div>tabs-layout</div>,
}));
vi.mock("./ConflictsSection", () => ({
  ConflictsSection: () => <div>conflicts-section</div>,
}));

import { MultiAgentResultsView } from "./MultiAgentResultsView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: runsMessages }}>
      <MultiAgentResultsView />
    </NextIntlClientProvider>,
  );
}

const RUN = {
  id: "magrun-1",
  pr_id: "pr-1",
  pr_number: 42,
  ran_at: new Date().toISOString(),
  agent_count: 2,
  total_duration_ms: 8200,
  total_cost_usd: 0.1,
  columns: [
    {
      run_id: "r1",
      agent_id: "a1",
      agent_name: "Security",
      provider: "openrouter",
      model: "gpt-4.1",
      status: "done",
      verdict: "request_changes",
      score: 62,
      summary: "s",
      duration_ms: 8200,
      cost_usd: 0.06,
      error: null,
      findings: [],
    },
    {
      run_id: "r2",
      agent_id: "a2",
      agent_name: "Style",
      provider: "openrouter",
      model: "gpt-4.1",
      status: "done",
      verdict: "approve",
      score: 80,
      summary: "s2",
      duration_ms: 3100,
      cost_usd: 0.04,
      error: null,
      findings: [],
    },
  ],
  conflicts: [],
};

describe("MultiAgentResultsView", () => {
  it("AC-51 — a PR with no multi-agent run states so and offers a route to configure", () => {
    useMultiAgentRunMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError("No multi-agent run for this pull request", 404),
      refetch: vi.fn(),
    });
    renderView();
    expect(screen.getByText("No multi-agent run yet")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Configure a run"));
    expect(pushMock).toHaveBeenCalledWith("/repos/repo-1/multi-agent?pr=pr-1");
  });

  it("renders both layouts (toggled) and the conflicts section from ONE read (AC-29)", () => {
    useMultiAgentRunMock.mockReturnValue({ data: RUN, isLoading: false, isError: false, error: null, refetch: vi.fn() });
    renderView();
    expect(screen.getByText("columns-layout")).toBeInTheDocument();
    expect(screen.getByText("conflicts-section")).toBeInTheDocument();

    // The layout toggle is client-side React state — switching it re-renders
    // with the SAME already-fetched `run`, never a different query.
    fireEvent.click(screen.getByText("tabs"));
    expect(screen.getByText("tabs-layout")).toBeInTheDocument();
    expect(screen.queryByText("columns-layout")).not.toBeInTheDocument();
  });

  it("AC-59 — the run-summary line reports agent count/duration/cost with no worktree or queueing-library reference", () => {
    useMultiAgentRunMock.mockReturnValue({ data: RUN, isLoading: false, isError: false, error: null, refetch: vi.fn() });
    renderView();
    const meta = screen.getByText(/2 agents/);
    expect(meta.textContent).not.toMatch(/worktree|p-queue/i);
  });

  it("AC-49/50 — every agent failed with the SAME reason renders it once, not per-agent", () => {
    useMultiAgentRunMock.mockReturnValue({
      data: {
        ...RUN,
        columns: RUN.columns.map((c) => ({ ...c, status: "failed", error: "diff load failed: timeout", score: null })),
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderView();
    expect(screen.getByText("Every agent failed to complete this run.")).toBeInTheDocument();
    expect(screen.getByText("Every agent failed for the same reason: diff load failed: timeout")).toBeInTheDocument();
  });
});
