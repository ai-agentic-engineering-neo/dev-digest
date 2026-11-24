import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, SkillListItem } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const setMutate = vi.fn();
let skillsData: SkillListItem[] = [];
let linksData: AgentSkillLink[] = [];

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: skillsData, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentSkills: () => ({ data: linksData, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetAgentSkills: () => ({ mutate: setMutate }),
}));

import { SkillsTab } from "./SkillsTab";

const AGENT = { id: "ag1" } as Agent;
const sk = (id: string, over: Partial<SkillListItem> = {}): SkillListItem => ({
  id,
  name: `skill-${id}`,
  description: `desc ${id}`,
  type: "rubric",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
  agent_count: 0,
  ...over,
});
const link = (skill_id: string, order: number): AgentSkillLink => ({ agent_id: "ag1", skill_id, order });

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  setMutate.mockClear();
  skillsData = [sk("a"), sk("b"), sk("c", { enabled: false })];
  linksData = [link("b", 0), link("a", 1)];
});
afterEach(cleanup);

describe("SkillsTab", () => {
  it("shows counts, hint, linked-first order and the disabled-globally marker", () => {
    renderTab();
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
    expect(screen.getByText(/Order matters/)).toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((b) => b.getAttribute("aria-checked"))).toEqual(["true", "true", "false"]);
    expect(screen.getAllByText(/skill-/).map((e) => e.textContent)).toEqual(["skill-b", "skill-a", "skill-c"]);
    expect(screen.getByText("disabled globally")).toBeInTheDocument();
  });

  it("checking an unlinked skill appends it to the ordered set", () => {
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "skill-c" }));
    expect(setMutate).toHaveBeenCalledWith(["b", "a", "c"]);
  });

  it("unchecking removes it, keeping the order of the rest", () => {
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "skill-b" }));
    expect(setMutate).toHaveBeenCalledWith(["a"]);
  });

  it("up/down buttons post the reordered full list", () => {
    renderTab();
    fireEvent.click(screen.getByLabelText("Move skill-a up"));
    expect(setMutate).toHaveBeenLastCalledWith(["a", "b"]);
    fireEvent.click(screen.getByLabelText("Move skill-b down"));
    expect(setMutate).toHaveBeenLastCalledWith(["a", "b"]);
    expect(screen.queryByLabelText("Move skill-b up")).not.toBeInTheDocument();
  });

  it("drag and drop reorders", () => {
    renderTab();
    fireEvent.dragStart(screen.getByTestId("skill-row-skill-b"));
    fireEvent.dragOver(screen.getByTestId("skill-row-skill-a"));
    fireEvent.drop(screen.getByTestId("skill-row-skill-a"));
    expect(setMutate).toHaveBeenCalledWith(["a", "b"]);
  });

  it("filters rows by text", () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "skill-c" } });
    expect(screen.queryByText("skill-a")).not.toBeInTheDocument();
    expect(screen.getByText("skill-c")).toBeInTheDocument();
  });
});
