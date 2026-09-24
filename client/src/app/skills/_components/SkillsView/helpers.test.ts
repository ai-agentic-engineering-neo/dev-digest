import { describe, it, expect } from "vitest";
import { makeSkill } from "@/test/skill-fixtures";
import { filterSkills, statsById } from "./helpers";

const SKILLS = [
  makeSkill({ id: "a", name: "no-then-chains", description: "Prefer async/await", type: "convention" }),
  makeSkill({ id: "b", name: "secret-leakage-gate", description: "Flag hard-coded tokens", type: "security" }),
];

describe("filterSkills", () => {
  it("matches name or description, case-insensitively", () => {
    expect(filterSkills(SKILLS, "THEN", null).map((s) => s.id)).toEqual(["a"]);
    expect(filterSkills(SKILLS, "tokens", null).map((s) => s.id)).toEqual(["b"]);
    expect(filterSkills(SKILLS, "  ", null)).toHaveLength(2);
  });

  it("combines the type filter with the search", () => {
    expect(filterSkills(SKILLS, "", "security").map((s) => s.id)).toEqual(["b"]);
    expect(filterSkills(SKILLS, "then", "security")).toEqual([]);
  });
});

describe("statsById", () => {
  it("indexes rows by skill id", () => {
    const map = statsById([{ skill_id: "a", pull_rate: 0.5, accept_rate: null, findings: 2 }]);
    expect(map.get("a")?.findings).toBe(2);
    expect(statsById(undefined).size).toBe(0);
  });
});
