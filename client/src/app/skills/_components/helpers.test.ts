import { describe, it, expect } from "vitest";
import { makeSkill } from "./fixtures";
import { filterSkills, resolveSkillTab, skillHref, validateSkillForm } from "./helpers";

const VALID = { name: "pr-quality-rubric", description: "", type: "rubric" as const, body: "# Rubric" };

describe("filterSkills", () => {
  const skills = [
    makeSkill({ id: "a", name: "secret-leakage-gate", description: "Credentials" }),
    makeSkill({ id: "b", name: "pr-quality-rubric", description: "Scores PR SECRET hygiene" }),
    makeSkill({ id: "c", name: "naming", description: "Conventions" }),
  ];

  it("matches name or description case-insensitively and keeps all on a blank query", () => {
    expect(filterSkills(skills, "SECRET").map((s) => s.id)).toEqual(["a", "b"]);
    expect(filterSkills(skills, "  conv ").map((s) => s.id)).toEqual(["c"]);
    expect(filterSkills(skills, "   ")).toHaveLength(3);
    expect(filterSkills(skills, "nothing")).toEqual([]);
  });
});

describe("resolveSkillTab", () => {
  it.each([
    ["config", "config"],
    ["preview", "preview"],
    ["stats", "stats"],
    ["versions", "versions"],
    ["evals", "config"],
    ["junk", "config"],
    [null, "config"],
  ])("%s → %s", (raw, tab) => {
    expect(resolveSkillTab(raw)).toBe(tab);
  });
});

describe("skillHref", () => {
  it("encodes the id", () => {
    expect(skillHref("a/b", "stats")).toBe("/skills/a%2Fb?tab=stats");
  });
});

describe("validateSkillForm", () => {
  it("accepts a valid form", () => {
    expect(validateSkillForm(VALID)).toEqual({});
  });

  it("flags a missing or non-kebab name", () => {
    expect(validateSkillForm({ ...VALID, name: "" }).name?.key).toBe("nameRequired");
    for (const bad of ["Secret", "a--b", "-a", "a-", "a b", "a".repeat(65)]) {
      expect(validateSkillForm({ ...VALID, name: bad }).name?.key).toBe("nameFormat");
    }
    expect(validateSkillForm({ ...VALID, name: "a".repeat(64) }).name).toBeUndefined();
  });

  it("enforces body, description and message limits", () => {
    expect(validateSkillForm({ ...VALID, body: "  \n" }).body?.key).toBe("bodyRequired");
    expect(validateSkillForm({ ...VALID, body: "x".repeat(20_001) }).body).toEqual({
      key: "bodyTooLong",
      values: { max: 20_000 },
    });
    expect(validateSkillForm({ ...VALID, body: "x".repeat(20_000) }).body).toBeUndefined();
    expect(validateSkillForm({ ...VALID, description: "d".repeat(201) }).description?.key).toBe(
      "descriptionTooLong",
    );
    expect(validateSkillForm({ ...VALID, message: "m".repeat(121) }).message?.key).toBe("messageTooLong");
  });
});
