import { describe, it, expect } from "vitest";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import { attachedIdsOf, filterRows, move, orderRows, toggle } from "./helpers";

const skill = (id: string, name: string, description = ""): Skill => ({
  id,
  name,
  description,
  type: "custom",
  source: "manual",
  body: "body",
  enabled: true,
  version: 1,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  agent_count: 0,
});
const link = (skill_id: string, order: number): AgentSkillLink => ({ agent_id: "ag1", skill_id, order });

const SKILLS = [skill("a", "zeta"), skill("b", "alpha"), skill("c", "mid", "Secret leakage"), skill("d", "beta")];

describe("orderRows", () => {
  it("puts attached skills first in link order, then unattached by name", () => {
    const rows = orderRows(SKILLS, [link("c", 1), link("a", 0)]);
    expect(rows.map((r) => [r.skill.name, r.attached, r.position])).toEqual([
      ["zeta", true, 0],
      ["mid", true, 1],
      ["alpha", false, null],
      ["beta", false, null],
    ]);
    expect(attachedIdsOf(rows)).toEqual(["a", "c"]);
  });

  it("drops links whose skill is not in the workspace list", () => {
    const rows = orderRows(SKILLS, [link("gone", 0), link("b", 1)]);
    expect(attachedIdsOf(rows)).toEqual(["b"]);
    expect(rows[0]!.position).toBe(0);
  });
});

describe("toggle", () => {
  it("appends an unattached id and removes an attached one without mutating", () => {
    const ids = ["a", "b"];
    expect(toggle(ids, "c")).toEqual(["a", "b", "c"]);
    expect(toggle(ids, "a")).toEqual(["b"]);
    expect(ids).toEqual(["a", "b"]);
  });
});

describe("move", () => {
  it("moves up, down and across, and ignores out-of-range moves", () => {
    const ids = ["a", "b", "c"];
    expect(move(ids, 1, 0)).toEqual(["b", "a", "c"]);
    expect(move(ids, 0, 2)).toEqual(["b", "c", "a"]);
    expect(move(ids, 2, 0)).toEqual(["c", "a", "b"]);
    expect(move(ids, 0, -1)).toEqual(ids);
    expect(move(ids, 2, 3)).toEqual(ids);
    expect(ids).toEqual(["a", "b", "c"]);
  });
});

describe("filterRows", () => {
  it("matches name or description case-insensitively; blank keeps all", () => {
    const rows = orderRows(SKILLS, []);
    expect(filterRows(rows, " SECRET ").map((r) => r.skill.id)).toEqual(["c"]);
    expect(filterRows(rows, "ta").map((r) => r.skill.name)).toEqual(["beta", "zeta"]);
    expect(filterRows(rows, "  ")).toHaveLength(4);
  });
});
