import { describe, it, expect } from "vitest";
import type { SkillListItem } from "@devdigest/shared";
import { dropOn, filterRows, linkedIds, moveById, moveItem, orderRows, toggleLinked } from "./helpers";

const sk = (id: string): SkillListItem => ({
  id,
  name: id,
  description: `desc ${id}`,
  type: "custom",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
  agent_count: 0,
});

describe("SkillsTab helpers", () => {
  const skills = ["a", "b", "c", "d"].map(sk);

  it("linkedIds sorts by order and drops unknown skills", () => {
    const links = [
      { agent_id: "x", skill_id: "c", order: 1 },
      { agent_id: "x", skill_id: "ghost", order: 2 },
      { agent_id: "x", skill_id: "a", order: 0 },
    ];
    expect(linkedIds(links, skills)).toEqual(["a", "c"]);
  });

  it("orderRows puts linked first in link order, then the rest", () => {
    const rows = orderRows(skills, ["c", "a"]);
    expect(rows.map((r) => [r.skill.id, r.linked])).toEqual([
      ["c", true],
      ["a", true],
      ["b", false],
      ["d", false],
    ]);
  });

  it("toggleLinked appends on check and removes on uncheck", () => {
    expect(toggleLinked(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleLinked(["a", "b"], "a", false)).toEqual(["b"]);
    const same = ["a"];
    expect(toggleLinked(same, "a", true)).toBe(same);
  });

  it("moveItem / moveById clamp at the edges", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveById(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    const ids = ["a", "b"];
    expect(moveById(ids, "a", -1)).toBe(ids);
    expect(moveById(ids, "zzz", 1)).toBe(ids);
  });

  it("dropOn moves the dragged id to the target position", () => {
    expect(dropOn(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(dropOn(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });

  it("filterRows matches name or description", () => {
    const rows = orderRows(skills, []);
    expect(filterRows(rows, "DESC c").map((r) => r.skill.id)).toEqual(["c"]);
    expect(filterRows(rows, " ")).toHaveLength(4);
  });
});
