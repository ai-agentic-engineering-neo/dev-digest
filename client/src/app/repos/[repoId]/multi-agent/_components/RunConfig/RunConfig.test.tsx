import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/runs.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const state: {
  agents: Agent[];
  estimates: unknown[];
  agentsError: boolean;
  pullsLoading: boolean;
  pullsError: boolean;
} = {
  agents: [],
  estimates: [],
  agentsError: false,
  pullsLoading: false,
  pullsError: false,
};
const refetchAgents = vi.fn();
const refetchPulls = vi.fn();
vi.mock("@/lib/hooks/core", () => ({
  usePulls: () => ({
    data: state.pullsLoading || state.pullsError ? undefined : [{ number: 7, title: "Fix bug" }],
    isLoading: state.pullsLoading,
    isError: state.pullsError,
    refetch: refetchPulls,
  }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({
    data: state.agentsError ? undefined : state.agents,
    isLoading: false,
    isError: state.agentsError,
    refetch: refetchAgents,
  }),
  useAgentRunEstimates: () => ({ data: state.estimates }),
}));

import { RunConfig, type RunConfigProps } from "./RunConfig";

afterEach(() => {
  cleanup();
  push.mockClear();
  refetchAgents.mockClear();
  refetchPulls.mockClear();
  state.agentsError = false;
  state.pullsLoading = false;
  state.pullsError = false;
});

function makeAgents(n: number): Agent[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `a${String(i).padStart(2, "0")}`,
    name: `Agent ${i}`,
    description: `desc ${i}`,
    model: "gpt-4.1",
    enabled: i !== 1,
  })) as unknown as Agent[];
}

function setup(props: Partial<RunConfigProps> = {}) {
  const onChangeAgents = vi.fn();
  const onRun = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <RunConfig
        repoId="r1"
        prNumber={7}
        selectedIds={[]}
        onSelectPr={vi.fn()}
        onChangeAgents={onChangeAgents}
        onRun={onRun}
        isStarting={false}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onChangeAgents, onRun };
}

describe("RunConfig", () => {
  it("without a PR shows the pick-first block and a disabled run button", () => {
    state.agents = makeAgents(3);
    state.estimates = [];
    setup({ prNumber: null, selectedIds: ["a00"] });
    expect(screen.getByText("Pick a pull request first")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run 1 agent/ })).toBeDisabled();
  });

  it("lists the agents, flips select/clear all and labels the run button by count", () => {
    state.agents = makeAgents(3);
    state.estimates = [];
    const first = setup();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByText("disabled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select agents" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(first.onChangeAgents).toHaveBeenCalledWith(["a00", "a01", "a02"]);
    cleanup();

    const second = setup({ selectedIds: ["a00", "a01", "a02"] });
    expect(screen.getByRole("button", { name: "Run multi-agent review (3)" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(second.onChangeAgents).toHaveBeenCalledWith([]);
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (3)" }));
    expect(second.onRun).toHaveBeenCalledTimes(1);
  });

  it("disables unchecked cards at the cap and shows the hint", () => {
    state.agents = makeAgents(11);
    state.estimates = [];
    const ids = state.agents.slice(0, 10).map((a) => a.id);
    setup({ selectedIds: ids });
    expect(screen.getByRole("checkbox", { name: "Agent 10" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Agent 0" })).toBeEnabled();
    expect(screen.getByText("Up to 10 agents per run (API rate limit)")).toBeInTheDocument();
  });

  it("shows per-agent and total estimates only when history exists", () => {
    state.agents = makeAgents(2);
    state.estimates = [{ agent_id: "a00", sample_size: 3, avg_duration_ms: 8240, avg_cost_usd: 0.5 }];
    setup({ selectedIds: ["a00", "a01"] });
    expect(screen.getByText("≈ 8.2s · $0.500")).toBeInTheDocument();
    expect(screen.getByText("≈ 8.2s · $0.500 total")).toBeInTheDocument();
    cleanup();

    state.estimates = [];
    setup({ selectedIds: ["a00", "a01"] });
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
  });

  it("hides the total estimate until a pull request is picked", () => {
    state.agents = makeAgents(2);
    state.estimates = [{ agent_id: "a00", sample_size: 3, avg_duration_ms: 8240, avg_cost_usd: 0.5 }];
    setup({ prNumber: null, selectedIds: ["a00", "a01"] });
    expect(screen.getByText("Pick a pull request first")).toBeInTheDocument();
    expect(screen.queryByText(/total$/)).not.toBeInTheDocument();
  });

  it("shows a skeleton instead of the PR picker while pull requests load", () => {
    state.agents = makeAgents(2);
    state.estimates = [];
    state.pullsLoading = true;
    setup({ prNumber: null });
    expect(document.querySelector(".skeleton")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Select PR/ })).not.toBeInTheDocument();
  });

  it("shows an error with Retry instead of an empty PR picker when pull requests fail to load", () => {
    state.agents = makeAgents(2);
    state.estimates = [];
    state.pullsError = true;
    setup({ prNumber: null });
    expect(screen.getByText("Couldn’t load pull requests")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Select PR/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetchPulls).toHaveBeenCalledTimes(1);
  });

  it("shows an error with Retry, not the no-agents empty state, when loading agents fails", () => {
    state.agentsError = true;
    state.estimates = [];
    setup();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load agents");
    expect(screen.queryByText("Enable agents to run reviews")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetchAgents).toHaveBeenCalled();
  });
});
