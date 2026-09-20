import { describe, it, expect } from "vitest";
import { changedFields, validateSkillForm } from "./skill-form";

const ok = { name: "test-rubric", description: "Use when reviewing tests", type: "rubric" as const, body: "# Rule" };

describe("validateSkillForm", () => {
  it("accepts valid input", () => expect(validateSkillForm(ok)).toEqual({}));
  it("flags empty fields as required", () => {
    const e = validateSkillForm({ ...ok, name: " ", description: "", body: "" });
    expect(e.name?.code).toBe("required");
    expect(e.description?.code).toBe("required");
    expect(e.body?.code).toBe("required");
  });
  it("enforces max lengths", () => {
    const e = validateSkillForm({ ...ok, description: "x".repeat(501) });
    expect(e.description).toEqual({ code: "tooLong", max: 500 });
  });
  it("rejects a badly formatted name", () => {
    expect(validateSkillForm({ ...ok, name: "bad/name" }).name?.code).toBe("nameFormat");
  });
});

describe("changedFields", () => {
  it("is empty when nothing differs", () => expect(changedFields(ok, ok)).toEqual({}));
  it("returns only the changed fields", () => {
    expect(changedFields({ ...ok, body: "# New", type: "custom" }, ok)).toEqual({ body: "# New", type: "custom" });
  });
});
