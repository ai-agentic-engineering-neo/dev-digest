import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { renderWithProviders, screen, cleanup } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";
import type { Agent } from "@devdigest/shared";
import { AgentEditor } from "./AgentEditor";

beforeEach(() => {
  mockFetch({ "GET /providers/openai/models": [{ id: "gpt-4.1", provider: "openai" }] });
});
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

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithProviders(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("drops unsaved edits when switching to another agent", async () => {
    const { rerender, user } = renderWithProviders(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    const name = screen.getByDisplayValue("Security Reviewer");
    await user.clear(name);
    await user.type(name, "Unsaved");
    rerender(<AgentEditor agent={{ ...AGENT, id: "ag2", name: "Perf Reviewer" }} tab="config" onTab={() => {}} />);
    expect(screen.getByDisplayValue("Perf Reviewer")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Unsaved")).toBeNull();
  });
});
