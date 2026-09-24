import { describe, it, expect } from "vitest";
import { makeSkill } from "@/test/skill-fixtures";
import { buildSavePatch, changedFields, isVersionedChange } from "./helpers";

const SKILL = makeSkill({ version: 5 });

describe("SkillEditor draft helpers", () => {
  it("changedFields drops fields edited back to the live value", () => {
    expect(changedFields({ name: SKILL.name, type: "security" }, SKILL)).toEqual({ type: "security" });
    expect(changedFields({}, SKILL)).toEqual({});
  });

  it("only body/description changes are versioned", () => {
    expect(isVersionedChange({ type: "security", enabled: false, name: "x" })).toBe(false);
    expect(isVersionedChange({ body: "b" })).toBe(true);
    expect(isVersionedChange({ description: "d" })).toBe(true);
  });

  it("buildSavePatch adds base_version only for a versioned change", () => {
    expect(buildSavePatch({ type: "security" }, SKILL)).toEqual({ type: "security" });
    expect(buildSavePatch({ body: "new" }, SKILL)).toEqual({ body: "new", base_version: 5 });
  });
});
