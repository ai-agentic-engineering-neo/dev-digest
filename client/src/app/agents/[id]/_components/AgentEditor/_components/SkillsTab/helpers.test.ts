import { describe, it, expect } from "vitest";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import {
  canMove,
  countEnabledLinks,
  filterLinks,
  isReorderable,
  moveDelta,
  moveItem,
  newLink,
  removeLink,
  setLinkEnabled,
  toLinkPayload,
  unlinkedSkills,
} from "./helpers";

const link = (id: string, enabled = true, skill_enabled = true): AgentSkillLink => ({
  agent_id: "ag1",
  skill_id: id,
  order: 0,
  enabled,
  name: `skill-${id}`,
  type: "custom",
  skill_enabled,
});

describe("moveItem", () => {
  it("moves to the ends", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("clamps an out-of-range target and ignores a bad source", () => {
    expect(moveItem(["a", "b"], 0, 9)).toEqual(["b", "a"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("toLinkPayload", () => {
  it("keeps the order and each link's enabled flag", () => {
    expect(toLinkPayload([link("b"), link("a", false)])).toEqual([
      { skill_id: "b", enabled: true },
      { skill_id: "a", enabled: false },
    ]);
  });
});

describe("countEnabledLinks", () => {
  it("counts checked links whose skill is enabled globally", () => {
    expect(countEnabledLinks([link("a"), link("b", false), link("c", true, false)])).toBe(1);
  });
});

describe("filterLinks / unlinkedSkills / newLink", () => {
  it("filters by name", () => {
    expect(filterLinks([link("a"), link("b")], "SKILL-B").map((l) => l.skill_id)).toEqual(["b"]);
  });

  it("lists only skills not linked yet, and appends a new one enabled", () => {
    const sk = { id: "c", name: "c", type: "security", enabled: false } as Skill;
    expect(unlinkedSkills([{ ...sk, id: "a" }, sk], [link("a")]).map((s) => s.id)).toEqual(["c"]);
    expect(newLink("ag1", sk, 2)).toMatchObject({ skill_id: "c", order: 2, enabled: true, skill_enabled: false });
  });
});

describe("moveDelta", () => {
  it("moves only with Alt+arrow", () => {
    expect(moveDelta("ArrowUp", true)).toBe(-1);
    expect(moveDelta("ArrowDown", true)).toBe(1);
    expect(moveDelta("ArrowDown", false)).toBe(0);
    expect(moveDelta("Enter", true)).toBe(0);
  });
});

describe("isReorderable", () => {
  it("allows reordering only with a blank filter", () => {
    expect(isReorderable("  ")).toBe(true);
    expect(isReorderable("rubric")).toBe(false);
  });
});

describe("canMove", () => {
  it("accepts a move inside the list", () => {
    expect(canMove(3, 0, 2)).toBe(true);
  });

  it("refuses a no-op or a move past either end", () => {
    expect(canMove(3, 1, 1)).toBe(false);
    expect(canMove(3, 0, -1)).toBe(false);
    expect(canMove(3, 2, 3)).toBe(false);
  });
});

describe("setLinkEnabled / removeLink", () => {
  it("changes only the named link's flag", () => {
    expect(setLinkEnabled([link("a"), link("b")], "b", false).map((l) => l.enabled)).toEqual([true, false]);
  });

  it("drops only the named link", () => {
    expect(removeLink([link("a"), link("b")], "a").map((l) => l.skill_id)).toEqual(["b"]);
  });
});
