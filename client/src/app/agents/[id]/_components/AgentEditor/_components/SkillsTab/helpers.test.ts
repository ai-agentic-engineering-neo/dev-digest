import { describe, it, expect } from "vitest";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import { activeCount, buildRows, moveRow, toLinkItems, toggleRow } from "./helpers";

const sk = (id: string, name: string, enabled = true): Skill => ({
  id,
  name,
  description: `Use when ${name}.`,
  type: "rubric",
  source: "manual",
  body: "b",
  enabled,
  version: 1,
});
const link = (skill_id: string, order: number, enabled = true): AgentSkillLink => ({
  agent_id: "ag",
  skill_id,
  order,
  enabled,
});

const SKILLS = [sk("a", "alpha"), sk("b", "beta"), sk("c", "gamma", false), sk("d", "delta")];

describe("SkillsTab helpers", () => {
  it("puts linked skills first in saved order, then the rest by name", () => {
    const rows = buildRows(SKILLS, [link("c", 1), link("b", 0, false)]);
    expect(rows.map((r) => [r.skill.name, r.linked, r.enabled])).toEqual([
      ["beta", true, false],
      ["gamma", true, true],
      ["alpha", false, false],
      ["delta", false, false],
    ]);
  });

  it("checking an unlinked skill links and enables it; unchecking keeps the link", () => {
    let rows = buildRows(SKILLS, []);
    rows = toggleRow(rows, "a");
    expect(toLinkItems(rows)).toEqual([{ skill_id: "a", enabled: true }]);
    rows = toggleRow(rows, "a");
    expect(toLinkItems(rows)).toEqual([{ skill_id: "a", enabled: false }]);
  });

  it("reordering pins the whole visible order as links", () => {
    const rows = moveRow(buildRows(SKILLS, [link("a", 0)]), 0, 2);
    expect(toLinkItems(rows).map((i) => i.skill_id)).toEqual(["b", "d", "a", "c"]);
    expect(toLinkItems(rows).find((i) => i.skill_id === "a")?.enabled).toBe(true);
    expect(toLinkItems(rows).find((i) => i.skill_id === "d")?.enabled).toBe(false);
  });

  it("ignores out-of-range moves", () => {
    const rows = buildRows(SKILLS, []);
    expect(moveRow(rows, 0, -1)).toBe(rows);
  });

  it("counts only skills that reach the prompt (link and skill enabled)", () => {
    const rows = buildRows(SKILLS, [link("a", 0), link("c", 1), link("b", 2, false)]);
    expect(activeCount(rows)).toBe(1);
  });
});
