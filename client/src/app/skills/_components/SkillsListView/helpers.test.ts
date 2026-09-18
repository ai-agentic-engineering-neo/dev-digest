import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { filterSkills } from "./helpers";

const SKILLS: Skill[] = [
  {
    id: "1",
    name: "Uncovered branches",
    description: "Flag new production paths with no asserting test.",
    type: "custom",
    source: "manual",
    body: "# A",
    enabled: true,
    version: 1,
  },
  {
    id: "2",
    name: "Flaky tests",
    description: "Catch sleep and retry loops.",
    type: "custom",
    source: "manual",
    body: "# B",
    enabled: true,
    version: 1,
  },
];

describe("filterSkills", () => {
  it("filters by name", () => {
    expect(filterSkills(SKILLS, "flaky").map((s) => s.id)).toEqual(["2"]);
  });

  it("filters by description", () => {
    expect(filterSkills(SKILLS, "production paths").map((s) => s.id)).toEqual(["1"]);
  });

  it("returns all when search is empty", () => {
    expect(filterSkills(SKILLS, "  ")).toHaveLength(2);
  });
});
