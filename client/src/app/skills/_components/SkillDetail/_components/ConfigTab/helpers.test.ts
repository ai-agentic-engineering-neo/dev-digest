import { describe, it, expect } from "vitest";
import { isUntrusted, serverTokensFor, toSkillPatch } from "./helpers";

const SAVED = { name: "a", description: "d", type: "rubric", body: "b" } as const;

describe("toSkillPatch", () => {
  it("sends only the changed fields and a trimmed note", () => {
    expect(toSkillPatch(SAVED, { ...SAVED, body: "c" }, "  tighter  ")).toEqual({ body: "c", note: "tighter" });
  });

  it("omits an empty note", () => {
    expect(toSkillPatch(SAVED, { ...SAVED, name: "z" }, " ")).toEqual({ name: "z" });
  });
});

describe("serverTokensFor", () => {
  it("returns the server count only for the saved body", () => {
    expect(serverTokensFor({ body: "b", token_count: 166 }, "b")).toBe(166);
    expect(serverTokensFor({ body: "b", token_count: 166 }, "b2")).toBeNull();
    expect(serverTokensFor({ body: "b", token_count: undefined }, "b")).toBeNull();
  });
});

describe("isUntrusted", () => {
  it("flags community and imported skills", () => {
    expect(isUntrusted({ source: "community" })).toBe(true);
    expect(isUntrusted({ source: "imported_file" })).toBe(true);
    expect(isUntrusted({ source: "manual" })).toBe(false);
  });
});
