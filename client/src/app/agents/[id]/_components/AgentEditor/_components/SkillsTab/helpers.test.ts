import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { buildSkillRows, linkedIds, matchesFilter, moveLinked, toggleLinked } from "./helpers";

const sk = (id: string, name: string, type: Skill["type"] = "custom"): Skill => ({
  id,
  name,
  description: `${name} description`,
  type,
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
});

describe("SkillsTab helpers", () => {
  it("linkedIds sorts links by order", () => {
    expect(
      linkedIds([
        { agent_id: "a", skill_id: "y", order: 1 },
        { agent_id: "a", skill_id: "x", order: 0 },
      ]),
    ).toEqual(["x", "y"]);
  });

  it("buildSkillRows: linked first in prompt order, then the rest by name; drops dangling links", () => {
    const skills = [sk("1", "zeta"), sk("2", "alpha"), sk("3", "mid"), sk("4", "beta")];
    const rows = buildSkillRows(skills, ["3", "gone", "1"]);
    expect(rows.map((r) => [r.skill.name, r.linked, r.position])).toEqual([
      ["mid", true, 0],
      ["zeta", true, 1],
      ["alpha", false, -1],
      ["beta", false, -1],
    ]);
  });

  it("toggleLinked appends on check and removes on uncheck", () => {
    expect(toggleLinked(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleLinked(["a", "b"], "a")).toEqual(["b"]);
  });

  it("moveLinked moves within bounds and ignores unknown ids", () => {
    expect(moveLinked(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(moveLinked(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    expect(moveLinked(["a", "b"], "a", 99)).toEqual(["b", "a"]);
    expect(moveLinked(["a", "b"], "a", -5)).toEqual(["a", "b"]);
    expect(moveLinked(["a"], "x", 0)).toEqual(["a"]);
  });

  it("matchesFilter checks name, description and type", () => {
    const s = sk("1", "secret-leakage-gate", "security");
    expect(matchesFilter(s, "")).toBe(true);
    expect(matchesFilter(s, "LEAK")).toBe(true);
    expect(matchesFilter(s, "security")).toBe(true);
    expect(matchesFilter(s, "description")).toBe(true);
    expect(matchesFilter(s, "nope")).toBe(false);
  });
});
