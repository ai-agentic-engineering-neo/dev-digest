import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const SKILLS: Skill[] = [
  {
    id: "sk-1",
    name: "PR Quality Rubric",
    description: "Baseline review rubric",
    type: "rubric",
    source: "manual",
    body: "# Rubric",
    enabled: true,
    version: 1,
    agents_count: 1,
  },
  {
    id: "sk-2",
    name: "No Secrets",
    description: "Flags leaked credentials",
    type: "security",
    source: "manual",
    body: "# Security",
    enabled: true,
    version: 1,
    agents_count: 0,
  },
  {
    id: "sk-3",
    name: "Repo Conventions",
    description: "House style",
    type: "convention",
    source: "extracted",
    body: "# Conventions",
    enabled: true,
    version: 1,
    agents_count: 2,
  },
];

// sk-1 is linked at order 0; sk-2 and sk-3 are unlinked.
const LINKS: AgentSkillLink[] = [{ agent_id: "ag1", skill_id: "sk-1", order: 0 }];

const mutate = vi.fn();
let mockIsPending = false;

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgentSkills: () => ({ data: LINKS, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetAgentSkills: () => ({ mutate, isPending: mockIsPending }),
}));

import { SkillsTab } from "./SkillsTab";

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
  skills_count: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  mutate.mockClear();
  mockIsPending = false;
});

describe("SkillsTab (smoke)", () => {
  it("renders the merged list of every workspace skill with the linked count", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByText("PR Quality Rubric")).toBeInTheDocument();
    expect(screen.getByText("No Secrets")).toBeInTheDocument();
    expect(screen.getByText("Repo Conventions")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 enabled")).toBeInTheDocument();
  });

  it("checking an unlinked skill calls setAgentSkills with the new checked id appended", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const checkboxes = screen.getAllByRole("checkbox");
    // Row order is [sk-1 (linked), sk-2, sk-3] — check sk-2.
    fireEvent.click(checkboxes[1]!);
    expect(mutate).toHaveBeenCalledWith({ skill_ids: ["sk-1", "sk-2"] });
  });

  it("unchecking the only linked skill calls setAgentSkills with an empty list", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    expect(mutate).toHaveBeenCalledWith({ skill_ids: [] });
  });

  it("disables all checkboxes while a set-skills mutation is in flight", () => {
    mockIsPending = true;
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.every((cb) => cb.hasAttribute("disabled"))).toBe(true);
    fireEvent.click(checkboxes[1]!);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("filters the visible list by skill name", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "secrets" } });
    expect(screen.getByText("No Secrets")).toBeInTheDocument();
    expect(screen.queryByText("PR Quality Rubric")).not.toBeInTheDocument();
    expect(screen.queryByText("Repo Conventions")).not.toBeInTheDocument();
  });
});
