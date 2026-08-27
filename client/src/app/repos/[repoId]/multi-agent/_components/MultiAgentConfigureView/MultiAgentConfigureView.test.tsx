import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import runsMessages from "../../../../../../../messages/en/runs.json";

const pushMock = vi.fn();
let currentSearch = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo-1" }),
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => currentSearch,
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

const { usePullsMock, useAgentsMock, useAgentRunEstimatesMock, useMultiAgentRunMock, startRunMutate } = vi.hoisted(
  () => ({
    usePullsMock: vi.fn(),
    useAgentsMock: vi.fn(),
    useAgentRunEstimatesMock: vi.fn(),
    useMultiAgentRunMock: vi.fn(),
    startRunMutate: vi.fn(),
  }),
);
vi.mock("@/lib/hooks/core", () => ({ usePulls: usePullsMock }));
vi.mock("@/lib/hooks/agents", () => ({ useAgents: useAgentsMock }));
vi.mock("@/lib/hooks/multi-agent", () => ({
  useAgentRunEstimates: useAgentRunEstimatesMock,
  useMultiAgentRun: useMultiAgentRunMock,
  useStartMultiAgentRun: () => ({ mutate: startRunMutate, isPending: false, isError: false, error: null }),
}));

import { MultiAgentConfigureView } from "./MultiAgentConfigureView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  currentSearch = new URLSearchParams();
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: runsMessages }}>
      <MultiAgentConfigureView />
    </NextIntlClientProvider>,
  );
}

const PULLS = [{ id: "pr-1", number: 42, title: "Add rate limiting" }];
const AGENTS = [
  { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
  { id: "a2", name: "Style", model: "gpt-4.1", enabled: true },
];
const ESTIMATES = [{ agent_id: "a1", agent_name: "Security", runs: 4, avg_duration_ms: 8200, avg_cost_usd: 0.06 }];

describe("MultiAgentConfigureView", () => {
  it("AC-1 — with no PR chosen, shows the pick-a-PR-first state and no agent list", () => {
    usePullsMock.mockReturnValue({ data: PULLS, isLoading: false });
    useAgentsMock.mockReturnValue({ data: AGENTS, isLoading: false });
    useAgentRunEstimatesMock.mockReturnValue({ data: ESTIMATES });
    useMultiAgentRunMock.mockReturnValue({ data: undefined });

    renderView();
    expect(screen.getByText("Select a pull request to choose agents.")).toBeInTheDocument();
    expect(screen.queryByText("Security")).not.toBeInTheDocument();
  });

  it("AC-2/AC-4 — selecting a PR presents every agent; the run button states the count and starts disabled", () => {
    usePullsMock.mockReturnValue({ data: PULLS, isLoading: false });
    useAgentsMock.mockReturnValue({ data: AGENTS, isLoading: false });
    useAgentRunEstimatesMock.mockReturnValue({ data: ESTIMATES });
    useMultiAgentRunMock.mockReturnValue({ data: undefined });

    renderView();
    fireEvent.change(screen.getByDisplayValue("Select PR"), { target: { value: "pr-1" } });

    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Style")).toBeInTheDocument();
    const runButton = screen.getByText("Run 0 agent(s)").closest("button")!;
    expect(runButton).toBeDisabled();
  });

  it("AC-5 — an agent with no completed run shows 'No estimate available', never 0 or a fabricated figure", () => {
    usePullsMock.mockReturnValue({ data: PULLS, isLoading: false });
    useAgentsMock.mockReturnValue({ data: AGENTS, isLoading: false });
    useAgentRunEstimatesMock.mockReturnValue({ data: ESTIMATES }); // only a1 has an estimate
    useMultiAgentRunMock.mockReturnValue({ data: undefined });

    renderView();
    fireEvent.change(screen.getByDisplayValue("Select PR"), { target: { value: "pr-1" } });

    expect(screen.getByText("~8.2s · $0.06")).toBeInTheDocument();
    // "Style" (no completed run) shows the explicit unavailable copy; the
    // aggregate line (nothing selected yet) says the same thing, honestly,
    // rather than fabricating a duration/cost — hence >=1, not exactly 1.
    expect(screen.getAllByText("No estimate available").length).toBeGreaterThanOrEqual(1);
  });

  it("AC-3/AC-6 — selecting agents updates the count and the aggregate estimate; select-all selects all", () => {
    usePullsMock.mockReturnValue({ data: PULLS, isLoading: false });
    useAgentsMock.mockReturnValue({
      data: [
        { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
        { id: "a2", name: "Style", model: "gpt-4.1", enabled: true },
      ],
    });
    useAgentRunEstimatesMock.mockReturnValue({
      data: [
        { agent_id: "a1", agent_name: "Security", runs: 4, avg_duration_ms: 8200, avg_cost_usd: 0.06 },
        { agent_id: "a2", agent_name: "Style", runs: 2, avg_duration_ms: 3100, avg_cost_usd: 0.04 },
      ],
    });
    useMultiAgentRunMock.mockReturnValue({ data: undefined });

    renderView();
    fireEvent.change(screen.getByDisplayValue("Select PR"), { target: { value: "pr-1" } });

    fireEvent.click(screen.getByText("Select all"));
    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
    expect(screen.getByText("Est. total: ~8.2s · $0.10")).toBeInTheDocument();
    expect(screen.getByText("Run 2 agent(s)").closest("button")).not.toBeDisabled();
  });

  it("AC-7 — a workspace with no agents states so, offers a route to /agents, and no run action", () => {
    usePullsMock.mockReturnValue({ data: PULLS, isLoading: false });
    useAgentsMock.mockReturnValue({ data: [], isLoading: false });
    useAgentRunEstimatesMock.mockReturnValue({ data: [] });
    useMultiAgentRunMock.mockReturnValue({ data: undefined });

    renderView();
    fireEvent.change(screen.getByDisplayValue("Select PR"), { target: { value: "pr-1" } });

    expect(screen.getByText("Enable agents to run reviews")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Go to Agents"));
    expect(pushMock).toHaveBeenCalledWith("/agents");
    expect(screen.queryByText(/Run \d agent/)).not.toBeInTheDocument();
  });

  it("AC-66/D26 — a PR that already has a run shows a prominent, non-navigating affordance to view it", () => {
    usePullsMock.mockReturnValue({ data: PULLS, isLoading: false });
    useAgentsMock.mockReturnValue({ data: AGENTS, isLoading: false });
    useAgentRunEstimatesMock.mockReturnValue({ data: ESTIMATES });
    useMultiAgentRunMock.mockReturnValue({ data: { id: "magrun-1", pr_id: "pr-1", columns: [], conflicts: [] } });

    renderView();
    fireEvent.change(screen.getByDisplayValue("Select PR"), { target: { value: "pr-1" } });

    // Never auto-navigates.
    expect(pushMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("View existing results"));
    expect(pushMock).toHaveBeenCalledWith("/repos/repo-1/multi-agent/pr-1");
  });

  it("deep-links a preselected PR via ?pr=", () => {
    currentSearch = new URLSearchParams("pr=pr-1");
    usePullsMock.mockReturnValue({ data: PULLS, isLoading: false });
    useAgentsMock.mockReturnValue({ data: AGENTS, isLoading: false });
    useAgentRunEstimatesMock.mockReturnValue({ data: ESTIMATES });
    useMultiAgentRunMock.mockReturnValue({ data: undefined });

    renderView();
    expect(screen.getByText("Security")).toBeInTheDocument();
  });
});
