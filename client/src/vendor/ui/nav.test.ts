import { describe, it, expect } from "vitest";
import { NAV, SETTINGS_ITEM, SHORTCUTS } from "./nav";

describe("NAV", () => {
  it("groups Skills, Agents and Conventions under SKILLS LAB with their g-shortcuts", () => {
    const lab = NAV.find((g) => g.section === "SKILLS LAB");
    expect(lab?.items.map((it) => [it.key, it.href, it.gKey])).toEqual([
      ["skills", "/skills", "s"],
      ["agents", "/agents", "a"],
      ["conventions", "/repos/:repoId/conventions", "c"],
    ]);
    expect(SHORTCUTS.map((s) => s.keys)).toContain("g c");
    // Agents moved out of WORKSPACE (no duplicate entry).
    expect(NAV.flatMap((g) => g.items).filter((it) => it.key === "agents")).toHaveLength(1);
    expect(SHORTCUTS.map((s) => s.keys)).toContain("g s");
  });

  it("never binds the same g-key twice", () => {
    const keys = [...NAV.flatMap((g) => g.items).map((it) => it.gKey), SETTINGS_ITEM.gKey].filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
