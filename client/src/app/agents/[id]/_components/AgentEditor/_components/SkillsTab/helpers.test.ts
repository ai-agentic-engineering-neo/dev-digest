import { describe, it, expect } from "vitest";
import type { AgentSkillDetail, Skill } from "@devdigest/shared";
import { buildRows, countEnabled, filterRows, reorder, toLinkPayload } from "./helpers";

/**
 * The Skills tab's list logic. Covered here rather than through the component
 * because the interesting part — ordering and the attach/enable rules — is
 * exactly the part a drag simulation would make hard to assert.
 */

const skill = (id: string, name: string, over: Partial<Skill> = {}): Skill => ({
  id,
  name,
  description: `desc ${name}`,
  type: "custom",
  source: "manual",
  body: "body",
  enabled: true,
  version: 1,
  evidence_files: null,
  ...over,
});

const link = (s: Skill, order: number, enabled = true): AgentSkillDetail => ({
  skill: s,
  order,
  enabled,
});

describe("buildRows", () => {
  it("puts linked skills first in link order, then the rest alphabetically", () => {
    const a = skill("1", "alpha");
    const b = skill("2", "bravo");
    const c = skill("3", "charlie");
    const rows = buildRows([a, b, c], [link(c, 0), link(a, 1)]);

    expect(rows.map((r) => r.skill.name)).toEqual(["charlie", "alpha", "bravo"]);
    expect(rows.map((r) => r.linked)).toEqual([true, true, false]);
  });

  it("carries the per-agent enabled flag through", () => {
    const a = skill("1", "alpha");
    const rows = buildRows([a], [link(a, 0, false)]);
    expect(rows[0]).toMatchObject({ linked: true, enabled: false });
  });

  it("an unlinked skill is never shown as enabled", () => {
    const rows = buildRows([skill("1", "alpha")], []);
    expect(rows[0]).toMatchObject({ linked: false, enabled: false });
  });

  it("drops a link whose skill is missing from the library", () => {
    // Only reachable from a stale cache, but rendering a nameless row is worse.
    const ghost = skill("gone", "ghost");
    expect(buildRows([], [link(ghost, 0)])).toEqual([]);
  });
});

describe("reorder", () => {
  it("moves an item down", () => {
    expect(reorder(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("moves an item up", () => {
    expect(reorder(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("returns the SAME array reference for a no-op, so callers can skip the save", () => {
    const list = ["a", "b"];
    expect(reorder(list, 1, 1)).toBe(list);
    expect(reorder(list, -1, 0)).toBe(list);
    expect(reorder(list, 0, 5)).toBe(list);
  });

  it("does not mutate the input", () => {
    const list = ["a", "b", "c"];
    reorder(list, 0, 2);
    expect(list).toEqual(["a", "b", "c"]);
  });
});

describe("toLinkPayload", () => {
  it("sends only linked rows, in display order, with their enabled flag", () => {
    const rows = buildRows(
      [skill("1", "alpha"), skill("2", "bravo"), skill("3", "charlie")],
      [link(skill("2", "bravo"), 0), link(skill("1", "alpha"), 1, false)],
    );
    expect(toLinkPayload(rows)).toEqual([
      { skill_id: "2", enabled: true },
      { skill_id: "1", enabled: false },
    ]);
  });

  it("omits unlinked rows — absence is how a skill gets detached", () => {
    expect(toLinkPayload(buildRows([skill("1", "alpha")], []))).toEqual([]);
  });
});

describe("countEnabled", () => {
  it("counts only rows that are both linked and switched on", () => {
    const a = skill("1", "alpha");
    const b = skill("2", "bravo");
    const rows = buildRows([a, b, skill("3", "charlie")], [link(a, 0), link(b, 1, false)]);
    expect(countEnabled(rows)).toBe(1);
  });
});

describe("filterRows", () => {
  it("matches name and description, case-insensitively", () => {
    const rows = buildRows([skill("1", "alpha"), skill("2", "bravo")], []);
    expect(filterRows(rows, "ALPH").map((r) => r.skill.name)).toEqual(["alpha"]);
    expect(filterRows(rows, "desc bravo").map((r) => r.skill.name)).toEqual(["bravo"]);
    expect(filterRows(rows, "  ")).toHaveLength(2);
  });
});
