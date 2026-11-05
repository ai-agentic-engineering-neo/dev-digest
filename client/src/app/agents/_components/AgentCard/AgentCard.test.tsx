import { describe, it, expect, afterEach, vi } from "vitest";
import { act, render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../lib/toast";

const deleteMutate = vi.fn();
vi.mock("../../../../lib/hooks/agents", () => ({
  useDeleteAgent: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { AgentCard } from "./AgentCard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("AgentCard (smoke)", () => {
  it("renders the agent name, model chip and skill count", () => {
    renderWithIntl(<AgentCard ag={AGENT} skillCount={3} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});

describe("AgentCard — delete", () => {
  it("trash opens the Delete agent modal without selecting the card; Cancel closes it", () => {
    const onClick = vi.fn();
    renderWithIntl(<AgentCard ag={AGENT} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/"Security Reviewer" will be permanently removed/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" })); // inside the modal: must not select
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onClick).not.toHaveBeenCalled();
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("Delete calls the API; success closes and reports onDeleted, an error stays in the modal", async () => {
    const onDeleted = vi.fn();
    renderWithIntl(<AgentCard ag={AGENT} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith("ag1", expect.anything());
    act(() => deleteMutate.mock.calls[0]![1].onError(new Error("Agent is running")));
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toContain("Agent is running");
    expect(onDeleted).not.toHaveBeenCalled();

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    act(() => deleteMutate.mock.calls[1]![1].onSuccess());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onDeleted).toHaveBeenCalledWith("ag1");
    expect(await screen.findByText("Agent deleted")).toBeInTheDocument();
  });
});
