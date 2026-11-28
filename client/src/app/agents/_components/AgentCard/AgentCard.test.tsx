import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import common from "../../../../../messages/en/common.json";
import messages from "../../../../../messages/en/agents.json";
import { AgentCard } from "./AgentCard";

const deleteAgent = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/hooks/agents", () => ({
  useDeleteAgent: () => ({ mutate: deleteAgent, isPending: false }),
}));

afterEach(() => {
  cleanup();
  deleteAgent.mockClear();
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
      <NextIntlClientProvider locale="en" messages={{ agents: messages, common }}>
        {ui}
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

describe("AgentCard delete confirmation", () => {
  it("deletes only after confirming in the dialog", () => {
    renderWithIntl(<AgentCard ag={AGENT} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    expect(deleteAgent).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Delete agent" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteAgent).toHaveBeenCalledWith("ag1");
  });

  it("does not delete when cancelled", () => {
    renderWithIntl(<AgentCard ag={AGENT} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deleteAgent).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
