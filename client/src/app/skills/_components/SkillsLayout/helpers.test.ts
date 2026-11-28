import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { filterSkills, hasNoMatch, hasNoSkills } from "./helpers";

const skill = (name: string, description: string): Skill => ({
  id: name,
  name,
  description,
  type: "custom",
  source: "manual",
  body: "",
  enabled: true,
  version: 1,
  agent_count: 0,
});

const LIST = [skill("pr-quality-rubric", "Rubric for PR quality"), skill("no-then-chains", "Prefer async/await")];

describe("filterSkills", () => {
  it("matches name or description, ignoring case", () => {
    expect(filterSkills(LIST, "RUBRIC").map((s) => s.name)).toEqual(["pr-quality-rubric"]);
    expect(filterSkills(LIST, "async").map((s) => s.name)).toEqual(["no-then-chains"]);
  });

  it("returns everything for a blank search", () => {
    expect(filterSkills(LIST, "  ")).toHaveLength(2);
  });
});

describe("hasNoSkills", () => {
  const settled = { isLoading: false, isError: false };

  it("is true for a loaded, empty workspace", () => {
    expect(hasNoSkills([], settled)).toBe(true);
    expect(hasNoSkills(LIST, settled)).toBe(false);
  });

  it("is false while loading or after a failed load", () => {
    expect(hasNoSkills(undefined, { isLoading: true, isError: false })).toBe(false);
    expect(hasNoSkills(undefined, { isLoading: false, isError: true })).toBe(false);
  });
});

describe("hasNoMatch", () => {
  it("is true only when skills exist and the search hides all of them", () => {
    expect(hasNoMatch(LIST, [])).toBe(true);
    expect(hasNoMatch([], [])).toBe(false);
    expect(hasNoMatch(LIST, LIST)).toBe(false);
  });
});
