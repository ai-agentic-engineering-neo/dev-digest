import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { buildPatch, draftFrom } from "./helpers";

const SKILL: Skill = {
  id: "s1",
  name: "untested-branches",
  description: "Flag untested branches",
  type: "rubric",
  source: "manual",
  body: "v1",
  enabled: true,
  version: 1,
};

describe("ConfigTab buildPatch", () => {
  it("is empty when nothing changed", () => {
    expect(buildPatch(SKILL, draftFrom(SKILL))).toEqual({});
  });

  it("sends the change note only together with a body change", () => {
    const d = { ...draftFrom(SKILL), description: "New directive", changeNote: "ignored" };
    expect(buildPatch(SKILL, d)).toEqual({ description: "New directive" });
    expect(buildPatch(SKILL, { ...d, body: "v2" })).toEqual({
      description: "New directive",
      body: "v2",
      change_note: "ignored",
    });
  });
});
