import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentListItem } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";

const push = vi.fn();
const deleteMutate = vi.fn();
let agents: AgentListItem[] = [];

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: agents, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateAgent: () => ({ mutate: vi.fn() }),
  useDeleteAgent: () => ({ mutate: deleteMutate, isPending: false }),
}));
vi.mock("./_components/CreateAgentModal", () => ({ CreateAgentModal: () => null }));

import { AgentsListView } from "./AgentsListView";

afterEach(() => {
  cleanup();
  push.mockReset();
  deleteMutate.mockReset();
});

const base: AgentListItem = {
  id: "a1",
  name: "Test Quality Reviewer",
  description: "Checks test coverage",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  system_prompt: "p",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
  skill_count: 2,
  runs: 36,
  accept_rate: 14,
  avg_cost_usd: 0.0072,
};

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <AgentsListView />
    </NextIntlClientProvider>,
  );
}

describe("AgentsListView", () => {
  it("renders a tile per agent with skills count and the runs/accept/cost stats", () => {
    agents = [
      base,
      {
        ...base,
        id: "a2",
        name: "API Contract Reviewer",
        skill_count: 4,
        runs: 17,
        accept_rate: 50,
        avg_cost_usd: 0.0134,
      },
    ];
    renderView();
    expect(screen.getByText("Test Quality Reviewer")).toBeInTheDocument();
    expect(screen.getByText("2 skills")).toBeInTheDocument();
    expect(screen.getByText("4 skills")).toBeInTheDocument();
    const stats = screen.getAllByTestId("agent-card-stats");
    expect(stats[0]).toHaveTextContent("36 runs · 14% accept · $0.007 avg");
    expect(stats[1]).toHaveTextContent("17 runs · 50% accept · $0.013 avg");
  });

  it("clicking a tile opens the agent; deleting goes through the confirm modal", () => {
    agents = [base];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    expect(push).not.toHaveBeenCalled();
    expect(deleteMutate).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith("a1", expect.anything());

    fireEvent.click(screen.getByText("Test Quality Reviewer"));
    expect(push).toHaveBeenCalledWith("/agents/a1?tab=config");
  });
});
