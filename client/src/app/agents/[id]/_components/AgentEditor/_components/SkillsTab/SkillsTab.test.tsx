import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, SkillWithStats } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const setEnabledMutate = vi.fn();
const setSkillsMutate = vi.fn();

vi.mock("@/lib/hooks/agents", () => ({
  useWorkspaceSkills: () => ({ data: SKILLS }),
  useAgentSkillLinks: () => ({ data: LINKS }),
  useSetAgentSkillEnabled: () => ({ mutate: setEnabledMutate }),
  useSetAgentSkills: () => ({ mutate: setSkillsMutate }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const AGENT: Agent = {
  id: "agent-1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "Review.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function skill(id: string, name: string): SkillWithStats {
  return {
    id,
    name,
    description: `Description for ${name}`,
    type: "custom",
    source: "manual",
    body: "# Body",
    enabled: true,
    version: 1,
    evidence_files: null,
    stats: { used_by: 0, pull_pct: null, accept_pct: null },
  };
}

// Six workspace skills; three linked links below match the "3 of 6 enabled"
// state the mockup shows for the Security Reviewer's Skills tab.
const SKILLS: SkillWithStats[] = [
  skill("s1", "pr-quality-rubric"),
  skill("s2", "no-then-chains"),
  skill("s3", "secret-leakage-gate"),
  skill("s4", "lethal-trifecta"),
  skill("s5", "phantom-api-gate"),
  skill("s6", "test-coverage-nudge"),
];

const LINKS: AgentSkillLink[] = [
  { agent_id: "agent-1", skill_id: "s1", order: 0, enabled: true },
  { agent_id: "agent-1", skill_id: "s3", order: 1, enabled: true },
  { agent_id: "agent-1", skill_id: "s4", order: 2, enabled: true },
  // Linked but switched off — must still render as an unchecked row, not
  // disappear, and its `order` must survive for a future re-enable.
  { agent_id: "agent-1", skill_id: "s5", order: 3, enabled: false },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab", () => {
  it("lists every workspace skill (not only linked ones) and counts enabled over the visible set", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    for (const s of SKILLS) expect(screen.getByText(s.name)).toBeInTheDocument();
    expect(screen.getByText("3 of 6 enabled")).toBeInTheDocument();
  });

  it("checks exactly the three enabled links, and shows the disabled-but-linked row unchecked", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByRole("checkbox", { name: "pr-quality-rubric" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "secret-leakage-gate" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "lethal-trifecta" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "phantom-api-gate" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "no-then-chains" })).not.toBeChecked();
  });

  it("filters the list by name, and updates the enabled count over just the visible rows", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), {
      target: { value: "secret" },
    });
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.queryByText("no-then-chains")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 1 enabled")).toBeInTheDocument();
  });

  it("checking a row toggles the PER-AGENT gate via PUT, and never calls the reorder/unlink mutation", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "no-then-chains" }));
    expect(setEnabledMutate).toHaveBeenCalledWith({
      agentId: "agent-1",
      skillId: "s2",
      patch: { enabled: true },
    });
    expect(setSkillsMutate).not.toHaveBeenCalled();
  });

  it("re-enabling an already-linked-but-off skill does not touch its order", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "phantom-api-gate" }));
    expect(setEnabledMutate).toHaveBeenCalledWith({
      agentId: "agent-1",
      skillId: "s5",
      patch: { enabled: true },
    });
    // The enable call carries no `order` — the whole point of the `enabled`
    // column is that flipping it back on does not move the link.
    const [call] = setEnabledMutate.mock.calls[0]!;
    expect(call.patch.order).toBeUndefined();
  });
});
