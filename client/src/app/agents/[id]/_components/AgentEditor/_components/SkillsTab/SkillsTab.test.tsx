import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import agents from "../../../../../../../../messages/en/agents.json";
import skills from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const mutate = vi.fn();
const SKILLS: Skill[] = [
  { id: "s1", name: "uncovered-branches", description: "d", type: "rubric", source: "manual", body: "b", enabled: true, version: 1 },
  { id: "s2", name: "over-mocking", description: "d", type: "convention", source: "manual", body: "b", enabled: true, version: 1 },
];
const LINKS: AgentSkillLink[] = [{ agent_id: "ag1", skill_id: "s1", order: 0, enabled: true }];

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isError: false }),
  useAgentSkillLinks: () => ({ data: LINKS, isError: false }),
  useSetAgentSkills: () => ({ mutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

const AGENT = { id: "ag1", name: "Test Quality Reviewer" } as Agent;

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents, skills }}>
      <ToastProvider>
        <SkillsTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab", () => {
  it("lists every workspace skill with the linked one checked and an enabled counter", () => {
    renderTab();
    expect(screen.getByText("1 of 2 enabled")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "uncovered-branches" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: "over-mocking" })).toHaveAttribute("aria-checked", "false");
  });

  it("checking a skill saves the ordered link set", () => {
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "over-mocking" }));
    expect(mutate).toHaveBeenCalledWith(
      [
        { skill_id: "s1", enabled: true },
        { skill_id: "s2", enabled: true },
      ],
      expect.anything(),
    );
  });

  it("arrow keys on the drag handle reorder and save", () => {
    renderTab();
    fireEvent.keyDown(screen.getByRole("button", { name: /Reorder over-mocking/ }), { key: "ArrowUp" });
    expect(mutate.mock.calls[0]![0].map((i: { skill_id: string }) => i.skill_id)).toEqual(["s2", "s1"]);
  });
});
