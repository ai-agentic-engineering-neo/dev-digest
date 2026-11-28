import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillView, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const save = vi.fn();
const mk = (id: string, name: string, type: Skill["type"]): Skill => ({
  id, name, description: "d", type, source: "manual", body: "b", enabled: true, version: 1,
});
const SKILLS = [mk("s1", "pr-quality-rubric", "rubric"), mk("s2", "no-then-chains", "convention"), mk("s3", "secret-leakage-gate", "security")];
const LINKS: AgentSkillView[] = [
  { agent_id: "a1", skill_id: "s1", order: 0, enabled: true, name: "pr-quality-rubric", description: "d", type: "rubric", source: "manual", skill_enabled: true },
  { agent_id: "a1", skill_id: "s3", order: 1, enabled: true, name: "secret-leakage-gate", description: "d", type: "security", source: "manual", skill_enabled: true },
];
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false }),
  useAgentSkills: () => ({ data: LINKS, isLoading: false, isError: false }),
  useSetAgentSkills: () => ({ mutate: save, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  save.mockReset();
});

const AGENT = { id: "a1", name: "Security Reviewer" } as Agent;

const renderTab = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <SkillsTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );

const names = () =>
  screen.getAllByTestId(/agent-skill-row-/).map((li) => li.getAttribute("data-testid")!.replace("agent-skill-row-", ""));

describe("Agent editor → Skills tab", () => {
  it("lists every workspace skill: linked (in order) first, with an enabled counter", () => {
    renderTab();
    expect(names()).toEqual(["pr-quality-rubric", "secret-leakage-gate", "no-then-chains"]);
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save skills" })).toBeDisabled();
  });

  it("enable + reorder, then saves the full ordered list in one batch", () => {
    renderTab();
    const row = screen.getByTestId("agent-skill-row-no-then-chains");
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(screen.getByText("3 of 3 enabled")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move no-then-chains up" }));
    expect(names()).toEqual(["pr-quality-rubric", "no-then-chains", "secret-leakage-gate"]);

    fireEvent.click(screen.getByRole("button", { name: "Save skills" }));
    expect(save).toHaveBeenCalledWith(
      {
        agentId: "a1",
        input: {
          skills: [
            { skill_id: "s1", enabled: true },
            { skill_id: "s2", enabled: true },
            { skill_id: "s3", enabled: true },
          ],
        },
      },
      expect.anything(),
    );
  });

  it("filtering disables reordering", () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "secret" } });
    expect(names()).toEqual(["secret-leakage-gate"]);
    expect(screen.getByRole("button", { name: "Move secret-leakage-gate up" })).toBeDisabled();
  });
});
