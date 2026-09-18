import { describe, it, expect } from "vitest";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import {
  applyDrop,
  enabledCount,
  filterSkillRows,
  mergeCatalogWithLinks,
  toBindings,
  toggleRow,
} from "./helpers";

function skill(id: string, name: string, enabled = true): Skill {
  return {
    id,
    name,
    description: `${name} directive.`,
    type: "custom",
    source: "manual",
    body: `# ${name}`,
    enabled,
    version: 1,
  };
}

function link(
  skill_id: string,
  name: string,
  order: number,
  enabled: boolean,
  skill_enabled = true,
): AgentSkillLink {
  return {
    agent_id: "ag1",
    skill_id,
    order,
    enabled,
    name,
    type: "custom",
    description: `${name} directive.`,
    skill_enabled,
  };
}

const catalog = [
  skill("1", "Alpha"),
  skill("2", "Bravo"),
  skill("3", "Charlie"),
  skill("4", "Delta"),
  skill("5", "Echo", false),
  skill("6", "Foxtrot", false),
];

describe("mergeCatalogWithLinks", () => {
  it("paints unlinked rows unchecked and keeps linked order", () => {
    const rows = mergeCatalogWithLinks(catalog, [
      link("3", "Charlie", 0, true),
      link("1", "Alpha", 1, false),
    ]);
    expect(rows.map((r) => r.skill_id)).toEqual(["3", "1", "2", "4", "5", "6"]);
    expect(rows.find((r) => r.skill_id === "2")).toMatchObject({ linked: false, enabled: false });
    expect(rows.find((r) => r.skill_id === "1")).toMatchObject({ linked: true, enabled: false });
  });
});

describe("enabledCount", () => {
  it("counts only rows with both global and per-agent enabled", () => {
    const rows = mergeCatalogWithLinks(catalog, [
      link("1", "Alpha", 0, true),
      link("5", "Echo", 1, true, false),
    ]);
    expect(enabledCount(rows)).toEqual({ n: 1, m: 6 });
  });
});

describe("filterSkillRows", () => {
  it("filters by name only", () => {
    const rows = mergeCatalogWithLinks(catalog, []);
    expect(filterSkillRows(rows, "delta").map((r) => r.skill_id)).toEqual(["4"]);
    expect(filterSkillRows(rows, "directive")).toHaveLength(0);
  });
});

describe("toggleRow / applyDrop", () => {
  it("unchecking keeps the row linked", () => {
    const rows = toggleRow(mergeCatalogWithLinks(catalog, [link("1", "Alpha", 0, true)]), "1", false);
    expect(toBindings(rows)).toEqual([{ skill_id: "1", enabled: false }]);
  });

  it("first drop of an unlinked row creates a link", () => {
    const rows = applyDrop(mergeCatalogWithLinks(catalog, [link("1", "Alpha", 0, true)]), "2", "1");
    expect(toBindings(rows).map((b) => b.skill_id)).toEqual(["2", "1"]);
    expect(rows.find((r) => r.skill_id === "2")?.enabled).toBe(true);
  });
});
