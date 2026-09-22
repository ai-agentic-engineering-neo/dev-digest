import { describe, it, expect, afterEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup, waitFor } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(cleanup);

const AGENTS = [{ id: "a1", name: "Security", model: "gpt-4.1", enabled: true }];

describe("RunReviewDropdown", () => {
  it("renders the trigger label", () => {
    mockFetch({ "GET /agents": AGENTS });
    renderWithProviders(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });

  it("running one agent posts the review and hands the new run ids up", async () => {
    const api = mockFetch({
      "GET /agents": AGENTS,
      "POST /pulls/pr1/review": {
        pr_id: "pr1",
        runs: [{ run_id: "run-9", agent_id: "a1", agent_name: "Security" }],
        reviews: [],
      },
    });
    const onRunsStarted = vi.fn();
    const { user } = renderWithProviders(<RunReviewDropdown prId="pr1" onRunsStarted={onRunsStarted} />);

    await user.click(screen.getByText("Run Review"));
    await user.click(await screen.findByText("Security"));

    await waitFor(() => expect(onRunsStarted).toHaveBeenCalledWith(["run-9"]));
    expect(api.requests("POST", "/pulls/pr1/review").map((r) => r.body)).toEqual([{ agentId: "a1" }]);
  });
});
