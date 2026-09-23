import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const mutateAsync = vi.fn(async () => ({ runs: [{ run_id: "r1" }] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgents: () => ({
    data: [
      { id: "a1", name: "Security", description: "Flags secrets", model: "gpt-4.1", enabled: true },
      { id: "a2", name: "Perf", description: "Flags slow code", model: "gpt-4.1", enabled: true },
      {
        id: "a3",
        name: "Contracts",
        description: "Breaking changes",
        model: "gpt-4.1",
        enabled: false,
      },
    ],
  }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync, isPending: false }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

beforeEach(() => mutateAsync.mockClear());
afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** Render and open the picker. */
function openPicker(props: { warnMerged?: boolean } = {}) {
  renderWithIntl(<RunReviewDropdown prId="pr1" {...props} />);
  fireEvent.click(screen.getByText("Run Review"));
}

const boxes = () => screen.getAllByRole("checkbox") as HTMLInputElement[];
/** One agent row's checkbox, in render order. */
const box = (i: number) => boxes()[i]!;

/** Click the footer run button. Wrapped in act because kicking a run awaits
 *  the mutation and then resets the selection — a state update after the
 *  click that React would otherwise warn about. */
async function clickRun(name: RegExp | string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

describe("RunReviewDropdown", () => {
  it("renders the trigger label", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });

  it("opens with the enabled agents pre-ticked and the disabled one not", () => {
    openPicker();
    expect(box(0).checked).toBe(true); // Security, enabled
    expect(box(1).checked).toBe(true); // Perf, enabled
    expect(box(2).checked).toBe(false); // Contracts, disabled
  });

  it("stays open while boxes are ticked", () => {
    openPicker();
    fireEvent.click(box(2));
    // The list is still on screen — a menu that closed on every click could
    // not express a multi-agent selection at all.
    expect(screen.getByText("PICK AGENTS TO RUN")).toBeInTheDocument();
    expect(box(2).checked).toBe(true);
  });

  /* The invariant this whole feature rests on: whatever is ticked is exactly
     what gets sent, as agentIds — one, two, several or all. */
  it("runs exactly one agent when only one is ticked", async () => {
    openPicker();
    fireEvent.click(box(1)); // untick Perf → leaves Security alone
    await clickRun(/Run Security/);
    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1"] });
  });

  it("runs a two-agent selection", async () => {
    openPicker();
    await clickRun(/Run multi-agent review \(2\)/);
    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1", "a2"] });
  });

  it("Select all includes the disabled agent", async () => {
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(boxes().every((b) => b.checked)).toBe(true);

    await clickRun(/Run multi-agent review \(3\)/);
    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1", "a2", "a3"] });
  });

  it("disables the run button when nothing is selected", () => {
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    const runButton = screen.getByRole("button", { name: "Select an agent to run" });
    expect(runButton).toBeDisabled();
    fireEvent.click(runButton);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("warns, but still allows a run, on a merged PR", () => {
    openPicker({ warnMerged: true });
    expect(screen.getByText("Already merged — review is informational")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run multi-agent review \(2\)/ })).toBeEnabled();
  });

  it("labels a disabled agent as such without hiding it", () => {
    openPicker();
    const contractsRow = screen.getByText("Contracts").closest("label")!;
    expect(within(contractsRow).getByText("gpt-4.1 · disabled")).toBeInTheDocument();
  });
});
