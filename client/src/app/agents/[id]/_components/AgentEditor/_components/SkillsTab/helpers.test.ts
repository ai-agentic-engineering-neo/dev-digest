import { describe, it, expect } from "vitest";
import type { AgentSkillLink, SkillListItem } from "@devdigest/shared";
import {
  blockedIds,
  buildRows,
  countLinked,
  filterRows,
  groupRows,
  isLinkBlocked,
  reorder,
  sameIds,
  syncRows,
  toggleRow,
  toSkillIds,
  unlinkRows,
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
    injection_detected: false,
    injection_matches: [],
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

  it("only reorders linked rows: a move from or onto an unlinked row is a no-op", () => {
    const before = rows.map((r) => r.skill.id);
    expect(reorder(rows, "d", "a").map((r) => r.skill.id)).toEqual(before);
    expect(reorder(rows, "a", "d").map((r) => r.skill.id)).toEqual(before);
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

  it("toggling links an unlinked row (appended last) and unlinks a linked one", () => {
    expect(toSkillIds(toggleRow(rows, "d"))).toEqual(["a", "b", "c", "d"]);
    expect(toSkillIds(toggleRow(rows, "a"))).toEqual(["b", "c"]);
  });

  it("keeps linked rows first: a newly linked row lands after the last linked one, an unlinked one tops Available", () => {
    const linkedD = toggleRow(buildRows(CATALOG, [link("a", 0), link("c", 1)]), "d");
    expect(linkedD.map((r) => [r.skill.id, r.linked])).toEqual([
      ["a", true],
      ["c", true],
      ["d", true],
      ["b", false],
    ]);
    const unlinkedA = toggleRow(linkedD, "a");
    expect(unlinkedA.map((r) => [r.skill.id, r.linked])).toEqual([
      ["c", true],
      ["d", true],
      ["a", false],
      ["b", false],
    ]);
  });
});

describe("groupRows", () => {
  it("splits into Enabled and Available, each in list order", () => {
    const { enabled, available } = groupRows(buildRows(CATALOG, [link("c", 0), link("a", 1)]));
    expect(enabled.map((r) => r.skill.id)).toEqual(["c", "a"]);
    expect(available.map((r) => r.skill.id)).toEqual(["b", "d"]);
  });
});

describe("injection-flagged skills", () => {
  const flagged = skill("x", { injection_detected: true });
  const rows = buildRows([skill("a"), flagged], [link("a", 0)]);

  it("cannot be newly linked: blocked row, toggle is a no-op", () => {
    const row = rows.find((r) => r.skill.id === "x")!;
    expect(isLinkBlocked(row)).toBe(true);
    expect(toSkillIds(toggleRow(rows, "x"))).toEqual(["a"]);
  });

  it("an already-linked flagged skill is not blocked and can be unlinked", () => {
    const linked = buildRows([skill("a"), flagged], [link("x", 0), link("a", 1)]);
    expect(isLinkBlocked(linked[0]!)).toBe(false);
    expect(toSkillIds(toggleRow(linked, "x"))).toEqual(["a"]);
  });

  it("unlinkRows drops only linked ids named by a SKILL_BLOCKED response", () => {
    const all = buildRows(CATALOG, [link("a", 0), link("b", 1), link("c", 2)]);
    expect(toSkillIds(unlinkRows(all, ["b", "d", "ghost"]))).toEqual(["a", "c"]);
  });

  it("blockedIds reads details.skill_ids defensively", () => {
    expect(blockedIds({ skill_ids: ["a", 1, "b"] })).toEqual(["a", "b"]);
    expect(blockedIds(undefined)).toEqual([]);
    expect(blockedIds({ skill_ids: "a" })).toEqual([]);
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
    const edited = toggleRow(reorder(buildRows(CATALOG, [link("a", 0), link("c", 1)]), "a", "c"), "b");
    // edited: c, a, b linked; d unlinked
    const fresh = [skill("a", { name: "renamed" }), skill("b"), skill("d"), skill("e")];
    const synced = syncRows(edited, fresh); // c was deleted meanwhile, e is new
    expect(synced.map((r) => r.skill.id)).toEqual(["a", "b", "d", "e"]);
    expect(synced.find((r) => r.skill.id === "a")?.skill.name).toBe("renamed");
    expect(toSkillIds(synced)).toEqual(["a", "b"]);
  });
});

describe("sameIds", () => {
  it("compares ordered id lists", () => {
    expect(sameIds(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameIds(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameIds(["a"], ["a", "b"])).toBe(false);
  });
});
