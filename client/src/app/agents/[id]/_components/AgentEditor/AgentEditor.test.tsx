import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import contextMessages from "../../../../../../messages/en/context.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repos: [{ id: "r1", name: "api", clone_path: "/x" }], repoId: "r1", activeRepo: null, reposLoaded: true, setRepoId: vi.fn() }),
}));
vi.mock("@/lib/hooks/project-context", () => ({
  useContextFiles: () => ({ data: [{ path: "docs/a.md", kind: "docs", tokens: 50 }], isLoading: false, isError: false, refetch: vi.fn() }),
  useContextAttachments: () => ({ data: [{ path: "docs/a.md", order: 0, missing: false, too_large: false }], isLoading: false, isError: false, refetch: vi.fn() }),
  useSetContextAttachments: () => ({ mutate: vi.fn(), isPending: false }),
  useContextFile: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
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
  skill_count: 0,
  stats: { runs: 0, accept_rate: null, avg_cost_usd: null },
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

  it("offers a Context tab that shows the attach panel (AC-20)", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="context" onTab={() => {}} />);
    expect(screen.getByRole("heading", { name: "Project context" })).toBeInTheDocument();
    expect(screen.getByText("1 of 1 attached")).toBeInTheDocument();
    expect(screen.getByText("a.md")).toBeInTheDocument();
    expect(screen.getByText("docs/")).toBeInTheDocument();
  });
});
