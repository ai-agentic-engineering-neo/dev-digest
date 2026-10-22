import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { attachedIds, moveBefore, orderSkills, toggleAttached } from "./helpers";

const sk = (id: string): Skill => ({
  id,
  name: id,
  description: "",
  type: "custom",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
});

describe("SkillsTab helpers", () => {
  it("attachedIds sorts links by order", () => {
    expect(
      attachedIds([
        { agent_id: "a", skill_id: "y", order: 1 },
        { agent_id: "a", skill_id: "x", order: 0 },
      ]),
    ).toEqual(["x", "y"]);
  });

  it("orderSkills puts attached skills first in prompt order, then the rest", () => {
    const rows = orderSkills([sk("a"), sk("b"), sk("c")], ["c", "a"]);
    expect(rows.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("toggleAttached appends on attach and removes on detach", () => {
    expect(toggleAttached(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleAttached(["a", "b"], "a", false)).toEqual(["b"]);
  });

  it("moveBefore moves the dragged id to the target's position", () => {
    expect(moveBefore(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(moveBefore(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(moveBefore(["a", "b"], "a", "zzz")).toEqual(["a", "b"]);
  });
});
