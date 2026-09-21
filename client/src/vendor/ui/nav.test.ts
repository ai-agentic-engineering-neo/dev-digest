import { describe, it, expect } from "vitest";
import { NAV, SHORTCUTS, resolveHref } from "./nav";

describe("nav registry", () => {
  const section = (name: string) => NAV.find((g) => g.section === name)!;

  it("lists Conventions in the SKILLS LAB section, not in WORKSPACE", () => {
    const lab = section("SKILLS LAB").items.map((i) => i.key);
    expect(lab).toEqual(["skills", "agents", "conventions"]);
    expect(section("WORKSPACE").items.map((i) => i.key)).not.toContain("conventions");
  });

  it("points Conventions at the repo-scoped route with the g c shortcut", () => {
    const item = section("SKILLS LAB").items.find((i) => i.key === "conventions")!;
    expect(item).toMatchObject({ label: "Conventions", icon: "ListChecks", gKey: "c" });
    expect(resolveHref(item.href, "repo-9")).toBe("/repos/repo-9/conventions");
    expect(SHORTCUTS).toContainEqual({ keys: "g c", label: "Go to Conventions", group: "Navigation" });
  });

  it("keeps every g-nav shortcut key unique", () => {
    const keys = NAV.flatMap((g) => g.items).flatMap((i) => (i.gKey ? [i.gKey] : []));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
