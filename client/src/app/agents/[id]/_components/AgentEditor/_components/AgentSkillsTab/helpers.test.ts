import { describe, it, expect } from "vitest";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import { enabledTokens, joinLinks, moveById, moveToTarget } from "./helpers";

const skill = (id: string, body = "abcd", enabled = true): Skill => ({
  id, name: id, description: "d", type: "custom", source: "manual", body, enabled, version: 1,
});
const link = (id: string, order: number, enabled = true): AgentSkillLink => ({ agent_id: "a", skill_id: id, order, enabled });

describe("moveById", () => {
  it("swaps with the neighbour", () => {
    expect(moveById(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveById(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });
  it("is a no-op at the edges", () => {
    expect(moveById(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    expect(moveById(["a", "b"], "b", 1)).toEqual(["a", "b"]);
  });
});

describe("moveToTarget", () => {
  it("moves an item onto a target position", () => {
    expect(moveToTarget(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(moveToTarget(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });
  it("ignores unknown ids and self-drops", () => {
    expect(moveToTarget(["a", "b"], "a", "a")).toEqual(["a", "b"]);
    expect(moveToTarget(["a", "b"], "x", "a")).toEqual(["a", "b"]);
  });
});

describe("joinLinks / enabledTokens", () => {
  const rows = joinLinks([link("b", 1), link("a", 0), link("gone", 2), link("c", 3, false)], [skill("a", "x".repeat(8)), skill("b", "x".repeat(4), false), skill("c")]);
  it("orders by link order and drops unknown skills", () => expect(rows.map((r) => r.skill.id)).toEqual(["a", "b", "c"]));
  it("counts only rows enabled on both levels", () => expect(enabledTokens(rows)).toBe(2));
});
