import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const mutate = vi.fn();
let links: AgentSkillLink[] = [];

const SKILLS: Skill[] = [
  { id: "s1", name: "pr-quality-rubric", description: "Rubric", type: "rubric", source: "manual", body: "b", enabled: true, version: 1 },
  { id: "s2", name: "no-then-chains", description: "Convention", type: "convention", source: "manual", body: "b", enabled: true, version: 1 },
  { id: "s3", name: "secret-leakage-gate", description: "Secrets", type: "security", source: "manual", body: "b", enabled: true, version: 1 },
  { id: "s4", name: "api-versioning", description: "Imported", type: "rubric", source: "community", body: "b", enabled: false, version: 1 },
];

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false }),
  useAgentSkills: () => ({ data: links, isLoading: false, isError: false }),
  useSetAgentSkills: () => ({ mutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  mutate.mockReset();
  links = [];
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "x",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
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

const rowNames = () => screen.getAllByRole("listitem").map((r) => r.getAttribute("data-testid"));

describe("SkillsTab", () => {
  it("shows linked skills first in prompt order with the N of M counter", () => {
    links = [
      { agent_id: "ag1", skill_id: "s3", order: 0 },
      { agent_id: "ag1", skill_id: "s1", order: 1 },
    ];
    renderTab();
    expect(screen.getByText("2 of 4 enabled")).toBeTruthy();
    expect(rowNames()).toEqual([
      "skill-row-secret-leakage-gate",
      "skill-row-pr-quality-rubric",
      "skill-row-api-versioning",
      "skill-row-no-then-chains",
    ]);
  });

  it("checking a skill appends it; unchecking removes it", () => {
    links = [{ agent_id: "ag1", skill_id: "s1", order: 0 }];
    renderTab();
    const row = screen.getByTestId("skill-row-no-then-chains");
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(mutate).toHaveBeenLastCalledWith(["s1", "s2"], expect.anything());

    fireEvent.click(within(screen.getByTestId("skill-row-pr-quality-rubric")).getByRole("checkbox"));
    expect(mutate).toHaveBeenLastCalledWith([], expect.anything());
  });

  it("reorders with the arrow buttons", () => {
    links = [
      { agent_id: "ag1", skill_id: "s1", order: 0 },
      { agent_id: "ag1", skill_id: "s2", order: 1 },
    ];
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Move no-then-chains up" }));
    expect(mutate).toHaveBeenLastCalledWith(["s2", "s1"], expect.anything());
    expect((screen.getByRole("button", { name: "Move pr-quality-rubric up" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("ignores links to deleted skills when reordering and saving", () => {
    links = [
      { agent_id: "ag1", skill_id: "gone", order: 0 },
      { agent_id: "ag1", skill_id: "s1", order: 1 },
      { agent_id: "ag1", skill_id: "s2", order: 2 },
    ];
    renderTab();
    expect(screen.getByText("2 of 4 enabled")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move no-then-chains up" }));
    expect(mutate).toHaveBeenLastCalledWith(["s2", "s1"], expect.anything());
  });

  it("reorders by drag and drop between linked rows", () => {
    links = [
      { agent_id: "ag1", skill_id: "s1", order: 0 },
      { agent_id: "ag1", skill_id: "s2", order: 1 },
      { agent_id: "ag1", skill_id: "s3", order: 2 },
    ];
    renderTab();
    const dataTransfer = { effectAllowed: "" };
    fireEvent.dragStart(screen.getByTestId("skill-row-secret-leakage-gate"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("skill-row-pr-quality-rubric"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("skill-row-pr-quality-rubric"), { dataTransfer });
    expect(mutate).toHaveBeenLastCalledWith(["s3", "s1", "s2"], expect.anything());
  });

  it("marks imported and globally disabled skills, and filters", () => {
    renderTab();
    const row = screen.getByTestId("skill-row-api-versioning");
    expect(within(row).getByText("imported")).toBeTruthy();
    expect(within(row).getByText("disabled globally")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "secret" } });
    expect(rowNames()).toEqual(["skill-row-secret-leakage-gate"]);
  });
});
