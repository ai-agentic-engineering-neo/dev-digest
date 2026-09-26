import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentSkillItem } from "@devdigest/shared";
import agentsMessages from "@messages/en/agents.json";
import skillsMessages from "@messages/en/skills.json";

const ITEMS: AgentSkillItem[] = [
  { id: "s1", name: "Security Rubric", description: "d1", type: "security", linked: true, enabled: true, order: 1 },
  { id: "s2", name: "Style Guide", description: "d2", type: "convention", linked: true, enabled: true, order: 2 },
  { id: "s3", name: "Perf Tips", description: "d3", type: "custom", linked: false, enabled: false, order: null },
];

const setSkillsMutate = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useAgentSkills: () => ({ data: ITEMS, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetAgentSkills: () => ({ mutate: setSkillsMutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  setSkillsMutate.mockClear();
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
      <SkillsTab agentId="ag1" />
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab — toggle/reorder produce the correct items payload", () => {
  it("linking an unlinked skill appends it, enabled, at the end of the ordered list", () => {
    renderTab();
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[2]!); // s3 — Perf Tips, currently unlinked

    expect(setSkillsMutate).toHaveBeenCalledTimes(1);
    const payload = setSkillsMutate.mock.calls[0]?.[0] as AgentSkillItem[];
    expect(payload.filter((i) => i.linked).map((i) => [i.id, i.order])).toEqual([
      ["s1", 1],
      ["s2", 2],
      ["s3", 3],
    ]);
    expect(payload.find((i) => i.id === "s3")).toMatchObject({ linked: true, enabled: true });
  });

  it("unlinking a linked skill drops it from the ordered list and disables it", () => {
    renderTab();
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!); // s1 — Security Rubric, currently linked

    const payload = setSkillsMutate.mock.calls[0]?.[0] as AgentSkillItem[];
    expect(payload.filter((i) => i.linked).map((i) => i.id)).toEqual(["s2"]);
    expect(payload.find((i) => i.id === "s1")).toMatchObject({ linked: false, enabled: false, order: null });
  });

  it("moving the second linked row up swaps its order with the first", () => {
    renderTab();
    const moveUpButtons = screen.getAllByRole("button", { name: "Move up" });
    // s1 renders one too (a no-op at the top of the list); s2's is the second.
    fireEvent.click(moveUpButtons[1]!);

    const payload = setSkillsMutate.mock.calls[0]?.[0] as AgentSkillItem[];
    expect(payload.filter((i) => i.linked).map((i) => [i.id, i.order])).toEqual([
      ["s2", 1],
      ["s1", 2],
    ]);
  });
});
