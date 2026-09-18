import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const mutate = vi.fn();

function skill(id: string, name: string, enabled = true): Skill {
  return {
    id,
    name,
    description: `${name} directive.`,
    type: "custom",
    source: "manual",
    body: `# ${name}`,
    enabled,
    version: 1,
  };
}

function link(id: string, name: string, order: number, enabled: boolean, skill_enabled = true): AgentSkillLink {
  return {
    agent_id: "ag1",
    skill_id: id,
    order,
    enabled,
    name,
    type: "custom",
    description: `${name} directive.`,
    skill_enabled,
  };
}

const catalog = [
  skill("1", "Alpha"),
  skill("2", "Bravo"),
  skill("3", "Charlie"),
  skill("4", "Delta"),
  skill("5", "Echo", false),
  skill("6", "Foxtrot", false),
];

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: catalog, isLoading: false }),
}));

vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgentSkills: () => ({
    data: [
      link("1", "Alpha", 0, true),
      link("2", "Bravo", 1, true),
      link("3", "Charlie", 2, true),
    ],
    isLoading: false,
  }),
  useSetAgentSkills: () => ({ mutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <SkillsTab agentId="ag1" />
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab", () => {
  it("shows 3 of 6 enabled when three rows are dual-gated", () => {
    renderTab();
    expect(screen.getByText("3 of 6 enabled")).toBeInTheDocument();
  });

  it("toggling a checkbox POSTs the updated enabled flag and keeps the row", () => {
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "Alpha" }));
    expect(mutate).toHaveBeenCalledWith([
      { skill_id: "1", enabled: false },
      { skill_id: "2", enabled: true },
      { skill_id: "3", enabled: true },
    ]);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("name filter hides non-matching rows", () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "delta" } });
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Delta")).toBeInTheDocument();
  });
});
