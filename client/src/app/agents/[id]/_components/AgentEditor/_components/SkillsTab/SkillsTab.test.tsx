import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import { mockApi, renderWithProviders } from "@/test/render";
import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
});

const link = (id: string, name: string, enabled: boolean, skill_enabled = true): AgentSkillLink => ({
  agent_id: "ag1",
  skill_id: id,
  order: 0,
  enabled,
  name,
  type: "security",
  skill_enabled,
});

const LINKS = [
  link("a", "pr-quality-rubric", true),
  link("b", "secret-leakage-gate", true),
  link("c", "phantom-api-gate", true, false),
];

function api() {
  return mockApi((method, path, body) => {
    if (method === "POST") return LINKS;
    if (path === "/agents/ag1/skills") return LINKS;
    if (path === "/skills") return [] as Skill[];
    return body;
  });
}

const lastPost = (calls: ReturnType<typeof api>) => calls.filter((c) => c.method === "POST").at(-1);

describe("agent SkillsTab", () => {
  it("shows the enabled count and a disabled-globally tag", async () => {
    api();
    renderWithProviders(<SkillsTab agentId="ag1" />);
    expect(await screen.findByText("2 of 3 enabled")).toBeInTheDocument();
    expect(screen.getByText(/Drag to reorder\./)).toBeInTheDocument();
    expect(screen.getByText("disabled globally")).toBeInTheDocument();
  });

  it("unchecking a row posts the full ordered list", async () => {
    const calls = api();
    renderWithProviders(<SkillsTab agentId="ag1" />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "secret-leakage-gate" }));
    await waitFor(() => expect(lastPost(calls)).toBeDefined());
    expect(lastPost(calls)).toEqual({
      method: "POST",
      path: "/agents/ag1/skills",
      body: {
        skills: [
          { skill_id: "a", enabled: true },
          { skill_id: "b", enabled: false },
          { skill_id: "c", enabled: true },
        ],
      },
    });
  });

  it("Alt+↓ on a handle moves the row one place down", async () => {
    const calls = api();
    renderWithProviders(<SkillsTab agentId="ag1" />);
    fireEvent.keyDown(await screen.findByRole("button", { name: /Reorder pr-quality-rubric/ }), {
      key: "ArrowDown",
      altKey: true,
    });
    await waitFor(() => expect(lastPost(calls)).toBeDefined());
    expect((lastPost(calls)!.body as { skills: { skill_id: string }[] }).skills.map((s) => s.skill_id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
});
