import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, Skill } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

const setMutate = vi.fn();
const sk = (id: string, name: string, extra: Partial<Skill> = {}): Skill => ({
  id, name, type: "custom", description: "", source: "manual", body: "b", enabled: true, version: 1, evidence_files: null, ...extra,
});
const SKILLS = [sk("s1", "pr-quality-rubric", { type: "rubric" }), sk("s2", "no-then-chains", { enabled: false }), sk("s3", "secret-leakage-gate", { type: "security" })];
const LINKS = [
  { agent_id: "ag1", skill_id: "s3", order: 0 },
  { agent_id: "ag1", skill_id: "s1", order: 1 },
];
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentSkills: () => ({ data: LINKS, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetAgentSkills: () => ({ mutate: setMutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  setMutate.mockReset();
});

const AGENT: Agent = {
  id: "ag1", name: "Security Reviewer", description: "", provider: "openai", model: "gpt-4.1", system_prompt: "p",
  output_schema: null, strategy: "single-pass", ci_fail_on: "critical", repo_intel: true, enabled: true, version: 3, skill_count: 2,
};

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
      <ToastProvider>
        <SkillsTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab", () => {
  it("lists linked skills first in prompt order and shows the enabled count", () => {
    renderTab();
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
    const rows = screen.getAllByTestId("agent-skill-row");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("secret-leakage-gate"),
      expect.stringContaining("pr-quality-rubric"),
      expect.stringContaining("no-then-chains"),
    ]);
    // globally disabled skill is marked
    expect(within(rows[2]!).getByText("disabled")).toBeInTheDocument();
  });

  it("checking an unlinked skill appends it; unchecking removes it", () => {
    renderTab();
    const rows = screen.getAllByRole("listitem");
    fireEvent.click(within(rows[2]!).getByRole("checkbox"));
    expect(setMutate).toHaveBeenLastCalledWith({ agentId: "ag1", skillIds: ["s3", "s1", "s2"] }, expect.anything());
    // Rows derive from the (mocked, unchanged) links, so unchecking s3 sends [s1].
    fireEvent.click(within(rows[0]!).getByRole("checkbox"));
    expect(setMutate).toHaveBeenLastCalledWith({ agentId: "ag1", skillIds: ["s1"] }, expect.anything());
  });

  it("the arrows reorder the linked set", () => {
    renderTab();
    fireEvent.click(screen.getByLabelText("Move secret-leakage-gate down"));
    expect(setMutate).toHaveBeenLastCalledWith({ agentId: "ag1", skillIds: ["s1", "s3"] }, expect.anything());
  });
});
