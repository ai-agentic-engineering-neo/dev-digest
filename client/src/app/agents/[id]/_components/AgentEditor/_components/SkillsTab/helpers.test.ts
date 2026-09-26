import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { filterRows, linkedIds, mergeRows, moveId } from "./helpers";

const sk = (id: string, name: string, type: Skill["type"] = "custom"): Skill => ({
  id, name, type, description: "", source: "manual", body: "b", enabled: true, version: 1, evidence_files: null,
});
const skills = [sk("c", "corner-cases"), sk("a", "api-gate"), sk("b", "breaking-change", "rubric")];

describe("SkillsTab helpers", () => {
  it("puts linked skills first in link order, then the rest alphabetically", () => {
    const rows = mergeRows(skills, [
      { agent_id: "ag", skill_id: "b", order: 1 },
      { agent_id: "ag", skill_id: "c", order: 0 },
      { agent_id: "ag", skill_id: "gone", order: 2 },
    ]);
    expect(rows.map((r) => `${r.skill.id}:${r.linked}`)).toEqual(["c:true", "b:true", "a:false"]);
    expect(linkedIds(rows)).toEqual(["c", "b"]);
  });

  it("moves an id and ignores out-of-range moves", () => {
    expect(moveId(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveId(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    expect(moveId(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveId(["a", "b"], 1, 2)).toEqual(["a", "b"]);
  });

  it("filters by name or type", () => {
    const rows = mergeRows(skills, []);
    expect(filterRows(rows, "rubric").map((r) => r.skill.id)).toEqual(["b"]);
    expect(filterRows(rows, "API").map((r) => r.skill.id)).toEqual(["a"]);
    expect(filterRows(rows, "")).toHaveLength(3);
  });
});
