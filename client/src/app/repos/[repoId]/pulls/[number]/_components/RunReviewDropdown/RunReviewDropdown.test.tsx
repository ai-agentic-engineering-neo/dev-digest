import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const { pushMock, startMultiAgentMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  startMultiAgentMock: vi.fn().mockResolvedValue({ id: "magrun-1", pr_id: "pr1" }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgents: () => ({
    data: [
      { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
      { id: "a2", name: "Legacy", model: "gpt-3.5", enabled: false },
    ],
  }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../../../../../../lib/hooks/multi-agent", () => ({
  useAgentRunEstimates: () => ({ data: [{ agent_id: "a1", agent_name: "Security", runs: 4, avg_duration_ms: 8200, avg_cost_usd: 0.06 }] }),
  useStartMultiAgentRun: () => ({ mutateAsync: startMultiAgentMock, isPending: false }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RunReviewDropdown (smoke)", () => {
  it("renders the trigger label", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" repoId="repo1" />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });
});

describe("RunReviewDropdown — D23 multi-select picker (AC-60..62)", () => {
  it("offers only enabled agents as multi-select rows, alongside the unchanged single-agent list of every agent", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" repoId="repo1" />);
    fireEvent.click(screen.getByText("Run Review"));

    expect(screen.getByText("Pick agents to run")).toBeInTheDocument();
    // Every agent (enabled + disabled) still appears in the unchanged
    // single-agent list — two "Legacy" occurrences would mean it leaked into
    // the multi-select block too, so assert there's exactly one.
    expect(screen.getAllByText("Legacy")).toHaveLength(1);
    expect(screen.getAllByText("Security")).toHaveLength(2); // multi-select row + single-agent row
  });

  it("selecting an agent and running submits the same request shape and lands on the results surface (AC-61)", async () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" repoId="repo1" />);
    fireEvent.click(screen.getByText("Run Review"));

    // The multi-select checkbox row for "Security" (the only enabled agent).
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Security/ }));
    await act(async () => {
      fireEvent.click(screen.getByText("Run 1 agent(s)"));
    });

    expect(startMultiAgentMock).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1"] });
    expect(pushMock).toHaveBeenCalledWith("/repos/repo1/multi-agent/pr1");
  });

  it("routes 'Configure agents…' to the full configure surface for this PR, not /agents (D23)", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" repoId="repo1" />);
    fireEvent.click(screen.getByText("Run Review"));
    fireEvent.click(screen.getByText("Configure agents…"));
    expect(pushMock).toHaveBeenCalledWith("/repos/repo1/multi-agent?pr=pr1");
  });
});
