import { describe, it, expect } from "vitest";
import { makeSkill } from "@/test/skill-fixtures";
import { matchesFilter, moveLink, splitSkills, toggleLink } from "./helpers";

const A = makeSkill({ id: "a", name: "zeta-rule" });
const B = makeSkill({ id: "b", name: "alpha-rule" });
const C = makeSkill({ id: "c", name: "beta-rule", description: "Flag N+1 queries" });

describe("SkillsTab helpers", () => {
  it("splitSkills: linked in link order, unlinked by name, unknown links dropped", () => {
    const { linked, unlinked } = splitSkills(
      [A, B, C],
      [
        { agent_id: "ag1", skill_id: "a", order: 1 },
        { agent_id: "ag1", skill_id: "gone", order: 2 },
        { agent_id: "ag1", skill_id: "c", order: 0 },
      ],
    );
    expect(linked.map((s) => s.id)).toEqual(["c", "a"]);
    expect(unlinked.map((s) => s.id)).toEqual(["b"]);
  });

  it("matchesFilter looks at name and description", () => {
    expect(matchesFilter(C, "n+1")).toBe(true);
    expect(matchesFilter(C, "ZETA")).toBe(false);
    expect(matchesFilter(C, "")).toBe(true);
  });

  it("toggleLink appends a new link and removes an unchecked one", () => {
    expect(toggleLink(["a", "b"], "c", true)).toEqual(["a", "b", "c"]);
    expect(toggleLink(["a", "b"], "a", false)).toEqual(["b"]);
  });

  it("moveLink moves the dragged id to the drop position", () => {
    expect(moveLink(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(moveLink(["a", "b", "c"], "a", "a")).toBeNull();
    expect(moveLink(["a", "b", "c"], "a", null)).toBeNull();
  });
});
