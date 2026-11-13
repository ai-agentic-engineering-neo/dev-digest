import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
const agents = [
  { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
  { id: "a2", name: "Performance", model: "gpt-4.1", enabled: true },
];
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: agents }),
}));
const mutateAsync = vi.fn(({ agentId }: { agentId?: string }) =>
  Promise.resolve({ runs: [{ run_id: agentId ? `run-${agentId}` : "run-all" }] }),
);
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync, isPending: false }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(() => {
  cleanup();
  mutateAsync.mockClear();
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
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });
});

describe("RunReviewDropdown multi-select", () => {
  it("toggles a checkbox without closing the menu, and 'Run selected' starts only the checked agents", async () => {
    const onRunsStarted = vi.fn();
    renderWithIntl(<RunReviewDropdown prId="pr1" onRunsStarted={onRunsStarted} />);

    fireEvent.click(screen.getByText("Run Review"));
    const runSelected = screen.getByRole("button", { name: /run selected/i });
    expect(runSelected).toBeDisabled();

    const [firstCheckbox] = screen.getAllByRole("checkbox");
    fireEvent.click(firstCheckbox!);
    // Menu stays open — the agent list (and the other agent's name) is still visible.
    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run selected \(1\)/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /run selected \(1\)/i }));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentId: "a1" });
    await waitFor(() => expect(onRunsStarted).toHaveBeenCalledWith(["run-a1"]));
  });

  it("clicking an agent's name still runs it alone, unaffected by selection", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    fireEvent.click(screen.getByText("Run Review"));
    fireEvent.click(screen.getByText("Security"));
    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentId: "a1" });
  });
});
