import { describe, it, expect } from "vitest";
import type { AgentSkillView, Skill } from "@devdigest/shared";
import { buildRows, move, toInput } from "./helpers";

const skill = (id: string, name: string, enabled = true): Skill => ({
  id,
  name,
  description: "d",
  type: "rubric",
  source: "manual",
  body: "b",
  enabled,
  version: 1,
});
const link = (id: string, name: string, order: number, enabled: boolean): AgentSkillView => ({
  agent_id: "a1",
  skill_id: id,
  order,
  enabled,
  name,
  description: "d",
  type: "rubric",
  source: "manual",
  skill_enabled: true,
});

describe("agent SkillsTab helpers", () => {
  it("linked skills first in agent order, then the rest alphabetically (unchecked)", () => {
    const rows = buildRows(
      [skill("1", "zeta"), skill("2", "alpha"), skill("3", "beta"), skill("4", "gamma", false)],
      [link("3", "beta", 0, true), link("1", "zeta", 1, false)],
    );
    expect(rows.map((r) => [r.name, r.enabled])).toEqual([
      ["beta", true],
      ["zeta", false],
      ["alpha", false],
      ["gamma", false],
    ]);
    expect(rows.find((r) => r.name === "gamma")!.skillEnabled).toBe(false);
  });

  it("move clamps and the PUT body keeps unchecked rows in place", () => {
    expect(move(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(move(["a", "b"], 0, -5)).toEqual(["a", "b"]);
    const rows = buildRows([skill("1", "a"), skill("2", "b")], [link("2", "b", 0, true)]);
    expect(toInput(rows)).toEqual({
      skills: [
        { skill_id: "2", enabled: true },
        { skill_id: "1", enabled: false },
      ],
    });
  });
});
