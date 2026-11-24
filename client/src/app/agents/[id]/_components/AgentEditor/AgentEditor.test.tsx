import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { ToastProvider } from "@/lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

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

function withIntl(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>
  );
}
function renderWithIntl(ui: React.ReactElement) {
  return render(withIntl(ui));
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });
});

describe("A2 Agent Editor — Config form state", () => {
  const OTHER: Agent = { ...AGENT, id: "ag2", name: "Perf Reviewer", description: "Finds slow paths" };
  const editor = (agent: Agent) => withIntl(<AgentEditor agent={agent} tab="config" onTab={() => {}} />);

  it("shows the new agent's values (dropping unsaved edits) when switching agents", () => {
    const { rerender } = render(editor(AGENT));
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "Edited name" } });
    expect(screen.getByDisplayValue("Edited name")).toBeInTheDocument();
    rerender(editor(OTHER));
    expect(screen.getByDisplayValue("Perf Reviewer")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Finds slow paths")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Edited name")).toBeNull();
  });

  it("keeps the local form when the same agent is refetched (e.g. after save)", () => {
    const { rerender } = render(editor(AGENT));
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "Edited name" } });
    rerender(editor({ ...AGENT, version: 2, name: "Server name" }));
    expect(screen.getByDisplayValue("Edited name")).toBeInTheDocument();
  });
});
