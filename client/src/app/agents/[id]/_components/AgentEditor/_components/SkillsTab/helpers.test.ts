import { describe, it, expect } from "vitest";
import type { AgentSkillLink, SkillListItem } from "@devdigest/shared";
import {
  buildRows,
  countLinked,
  filterRows,
  reorder,
  sameIds,
  syncRows,
  toggleRow,
  toSkillIds,
} from "./helpers";

function skill(id: string, extra: Partial<SkillListItem> = {}): SkillListItem {
  return {
    id,
    name: id,
    description: `${id} description`,
    type: "custom",
    source: "manual",
    body: "b",
    enabled: true,
    version: 1,
    used_by: 0,
    pull_rate: null,
    accept_rate: null,
    ...extra,
  };
}

const CATALOG = [skill("a"), skill("b"), skill("c"), skill("d")];
const link = (skill_id: string, order: number): AgentSkillLink => ({ agent_id: "ag", skill_id, order });

describe("buildRows", () => {
  it("puts linked skills first in link order, then unlinked in catalog order", () => {
    const rows = buildRows(CATALOG, [link("c", 1), link("a", 0)]);
    expect(rows.map((r) => [r.skill.id, r.linked])).toEqual([
      ["a", true],
      ["c", true],
      ["b", false],
      ["d", false],
    ]);
  });

  it("ignores links to skills that no longer exist", () => {
    expect(toSkillIds(buildRows(CATALOG, [link("ghost", 0), link("b", 1)]))).toEqual(["b"]);
  });
});

describe("reorder / toggle / toSkillIds", () => {
  const rows = buildRows(CATALOG, [link("a", 0), link("b", 1), link("c", 2)]);

  it("moves a row to the target position by id", () => {
    expect(reorder(rows, "a", "c").map((r) => r.skill.id)).toEqual(["b", "c", "a", "d"]);
    expect(reorder(rows, "c", "a").map((r) => r.skill.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("is a no-op for unknown ids or the same row, and never mutates its input", () => {
    const before = rows.map((r) => r.skill.id);
    expect(reorder(rows, "a", "a").map((r) => r.skill.id)).toEqual(before);
    expect(reorder(rows, "a", "nope").map((r) => r.skill.id)).toEqual(before);
    reorder(rows, "a", "c");
    expect(rows.map((r) => r.skill.id)).toEqual(before);
  });

  it("toSkillIds returns only linked rows in list order", () => {
    const moved = toggleRow(reorder(rows, "c", "a"), "b");
    expect(toSkillIds(moved)).toEqual(["c", "a"]);
    expect(countLinked(moved)).toBe(2);
  });

  it("toggling links an unlinked row and unlinks a linked one", () => {
    expect(toSkillIds(toggleRow(rows, "d"))).toEqual(["a", "b", "c", "d"]);
    expect(toSkillIds(toggleRow(rows, "a"))).toEqual(["b", "c"]);
  });
});

describe("filterRows", () => {
  const rows = buildRows(
    [skill("pr-rubric", { description: "Grades a PR" }), skill("secret-gate", { description: "Blocks tokens" })],
    [],
  );

  it("matches name or description case-insensitively", () => {
    expect(filterRows(rows, "RUBRIC").map((r) => r.skill.id)).toEqual(["pr-rubric"]);
    expect(filterRows(rows, "tokens").map((r) => r.skill.id)).toEqual(["secret-gate"]);
    expect(filterRows(rows, "  ").length).toBe(2);
    expect(filterRows(rows, "zzz")).toEqual([]);
  });
});

describe("syncRows", () => {
  it("keeps local order/linking, refreshes data, drops removed and appends new skills", () => {
    const edited = toggleRow(reorder(buildRows(CATALOG, [link("a", 0)]), "a", "c"), "b");
    const fresh = [skill("a", { name: "renamed" }), skill("b"), skill("d"), skill("e")];
    const synced = syncRows(edited, fresh);
    expect(synced.map((r) => r.skill.id)).toEqual(["b", "a", "d", "e"]);
    expect(synced.find((r) => r.skill.id === "a")?.skill.name).toBe("renamed");
    expect(toSkillIds(synced)).toEqual(["b", "a"]);
  });
});

describe("sameIds", () => {
  it("compares ordered id lists", () => {
    expect(sameIds(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameIds(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameIds(["a"], ["a", "b"])).toBe(false);
  });
});
