import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, Skill } from "@devdigest/shared";
import agents from "../../../../../../../../messages/en/agents.json";
import skills from "../../../../../../../../messages/en/skills.json";

const mutate = vi.fn();
const SKILLS: Skill[] = [
  { id: "s1", name: "branch-coverage", description: "", type: "rubric", source: "manual", body: "b", enabled: true, version: 1 },
  { id: "s2", name: "flaky-tests", description: "", type: "custom", source: "imported_file", body: "b", enabled: false, version: 2 },
  { id: "s3", name: "no-overmocking", description: "", type: "convention", source: "manual", body: "b", enabled: true, version: 1 },
];

// Stable references, like React Query's cached data (a fresh array per render
// would re-trigger the links → local-order effect forever).
const LINKS = [
  { agent_id: "ag1", skill_id: "s2", order: 0 },
  { agent_id: "ag1", skill_id: "s1", order: 1 },
];
const skillsQ = { data: SKILLS, isLoading: false, isError: false };
const linksQ = { data: LINKS, isLoading: false, isError: false };

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => skillsQ,
  useAgentSkillLinks: () => linksQ,
  useSetAgentSkills: () => ({ mutate }),
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
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("Agent editor — Skills tab", () => {
  it("lists attached skills first in prompt order and counts them", () => {
    renderTab();
    const rows = screen.getAllByTestId("agent-skill-row");
    expect(rows.map((r) => within(r).getByText(/-/).textContent)).toEqual([
      "flaky-tests",
      "branch-coverage",
      "no-overmocking",
    ]);
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
    // globally disabled but attached → marked, not hidden
    expect(within(rows[0]!).getByText("disabled")).toBeInTheDocument();
  });

  it("attaching appends to the end; detaching removes", () => {
    renderTab();
    const rows = screen.getAllByTestId("agent-skill-row");
    fireEvent.click(within(rows[2]!).getByRole("checkbox"));
    expect(mutate).toHaveBeenLastCalledWith(["s2", "s1", "s3"], expect.anything());
  });

  it("only attached rows are draggable; dropping reorders", () => {
    renderTab();
    const rows = screen.getAllByTestId("agent-skill-row");
    expect(rows[0]).toHaveAttribute("draggable", "true");
    expect(rows[2]).toHaveAttribute("draggable", "false");
    const dataTransfer = { effectAllowed: "" };
    fireEvent.dragStart(rows[1]!, { dataTransfer });
    fireEvent.dragOver(rows[0]!, { dataTransfer });
    fireEvent.drop(rows[0]!, { dataTransfer });
    expect(mutate).toHaveBeenLastCalledWith(["s1", "s2"], expect.anything());
  });
});
