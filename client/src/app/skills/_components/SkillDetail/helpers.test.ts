import { describe, it, expect } from "vitest";
import { ApiError } from "@/lib/api";
import { changedSkillFields, isDirty, isNotFound, leavingHref, nextVersion } from "./helpers";

const SAVED = { name: "a", description: "d", type: "rubric", body: "b" } as const;

describe("isDirty", () => {
  it("is false for identical content", () => {
    expect(isDirty(SAVED, { ...SAVED })).toBe(false);
  });

  it.each(["name", "description", "body"] as const)("is true when %s differs", (field) => {
    expect(isDirty(SAVED, { ...SAVED, [field]: "x" })).toBe(true);
  });

  it("is true when the type differs", () => {
    expect(isDirty(SAVED, { ...SAVED, type: "custom" })).toBe(true);
  });
});

describe("changedSkillFields", () => {
  it("returns only the differing fields", () => {
    expect(changedSkillFields(SAVED, { ...SAVED, body: "new" })).toEqual({ body: "new" });
  });
});

describe("leavingHref", () => {
  const here = "http://localhost:3000/skills/sk1?tab=config";

  it("returns the destination of a link to another page", () => {
    expect(leavingHref("/skills/sk2?tab=config", here)).toBe("/skills/sk2?tab=config");
    expect(leavingHref("http://localhost:3000/agents", here)).toBe("/agents");
  });

  it("ignores another tab of the same skill and other origins", () => {
    expect(leavingHref("/skills/sk1?tab=preview", here)).toBeNull();
    expect(leavingHref("https://github.com/x", here)).toBeNull();
  });
});

describe("isNotFound", () => {
  it("is true only for an API 404", () => {
    expect(isNotFound(new ApiError("Not found", 404))).toBe(true);
    expect(isNotFound(new ApiError("Boom", 500))).toBe(false);
    expect(isNotFound(new Error("Not found"))).toBe(false);
  });
});

describe("nextVersion", () => {
  it("is one past the current version", () => {
    expect(nextVersion({ version: 5 })).toBe(6);
  });
});
