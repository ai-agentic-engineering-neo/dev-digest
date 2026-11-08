import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

vi.mock("../../../../../lib/hooks/project-context", () => ({
  useContextDocs: () => ({
    data: { repo_id: "r1", state: { status: "ready" }, docs: [{ path: "docs/a.md", source: "docs", tokens: 10, attached_agents: 0 }] },
    isLoading: false,
    isError: false,
  }),
  useAgentContextDocs: () => ({ data: { agent_id: "ag1", repo_id: "r1", docs: [] }, isLoading: false, isError: false }),
  useSetAgentContextDocs: () => ({ mutate: vi.fn(), isPending: false }),
  useContextDoc: () => ({ data: undefined, isLoading: false, isError: false }),
  useContextResync: () => ({ start: vi.fn(), busy: false }),
}));
vi.mock("../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1", activeRepo: { id: "r1", name: "payments-api", full_name: "acme/payments-api" } }),
}));

import contextMessages from "../../../../../../messages/en/context.json";
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

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages, context: contextMessages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("?tab=context renders the Context tab", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="context" onTab={() => {}} />);
    expect(screen.getByText("0 of 1 attached")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Attach docs/a.md" })).toBeInTheDocument();
    expect(screen.queryByText("Save agent")).not.toBeInTheDocument();
  });
});
