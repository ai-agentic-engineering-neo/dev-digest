import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { renderWithProviders, screen, cleanup } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";
import type { Agent } from "@devdigest/shared";
import { AgentCard } from "./AgentCard";

beforeEach(() => {
  mockFetch({
    "GET /agents/ag1/skills": ["s1", "s2", "s3"].map((skill_id, order) => ({ agent_id: "ag1", skill_id, order })),
  });
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

describe("AgentCard (smoke)", () => {
  it("renders the agent name, model chip and the linked-skills count", async () => {
    renderWithProviders(<AgentCard ag={AGENT} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(await screen.findByText("3 skills")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithProviders(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});
