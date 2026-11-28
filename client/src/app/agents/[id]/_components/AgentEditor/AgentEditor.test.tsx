import { describe, it, expect } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import type { Agent, AgentSkillLink } from "@devdigest/shared";
import { mockApi, renderWithProviders } from "@/test/render";
import { AgentEditor } from "./AgentEditor";

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
  skill_count: 3,
};

const LINKS: AgentSkillLink[] = [
  { agent_id: "ag1", skill_id: "s1", order: 0, enabled: true, name: "pr-quality-rubric", type: "rubric", skill_enabled: true },
];

/** The API at the network boundary: models, skill links, workspace skills, and the agent PUT. */
function api() {
  return mockApi((method, path, body) => {
    if (path === "/providers/openai/models") return [{ id: "gpt-4.1", provider: "openai" }];
    if (path === "/agents/ag1/skills") return LINKS;
    if (path === "/skills") return [];
    if (method === "PUT") return { ...AGENT, ...(body as Partial<Agent>), version: AGENT.version + 1 };
    return undefined;
  });
}

const puts = (calls: ReturnType<typeof api>) => calls.filter((c) => c.method === "PUT");

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    api();
    renderWithProviders(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("renders the Skills tab for ?tab=skills from the agent's links", async () => {
    const calls = api();
    renderWithProviders(<AgentEditor agent={AGENT} tab="skills" onTab={() => {}} />);
    expect(await screen.findByText("1 of 1 enabled")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "pr-quality-rubric" })).toBeInTheDocument();
    expect(screen.queryByText("Save agent")).not.toBeInTheDocument();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toContain("GET /agents/ag1/skills");
  });

  it("saves only the changed fields, not an enabled toggled elsewhere", async () => {
    const calls = api();
    const view = renderWithProviders(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    // The list toggles `enabled` off: same id, new agent prop.
    view.rerender(<AgentEditor agent={{ ...AGENT, enabled: false, version: 2 }} tab="config" onTab={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByText("Save agent"));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0]).toEqual({ method: "PUT", path: "/agents/ag1", body: { name: "Renamed" } });
  });

  it("disables Save until something changes", () => {
    api();
    renderWithProviders(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    const save = screen.getByRole("button", { name: "Save agent" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "X" } });
    expect(save).toBeEnabled();
  });

  it("resets the draft when switching agents", () => {
    api();
    const view = renderWithProviders(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "Unsaved" } });
    view.rerender(<AgentEditor agent={{ ...AGENT, id: "ag2", name: "Other" }} tab="config" onTab={() => {}} />);
    expect(screen.getByDisplayValue("Other")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Unsaved")).not.toBeInTheDocument();
  });
});
