import { describe, it, expect } from "vitest";
import { canSaveDraft, isSkillType, parseTab, skillHref } from "./helpers";

describe("parseTab", () => {
  it("keeps a known tab", () => {
    expect(parseTab("versions")).toBe("versions");
  });

  it("falls back to config for a missing or unknown value", () => {
    expect(parseTab(null)).toBe("config");
    expect(parseTab("bogus")).toBe("config");
  });
});

describe("skillHref", () => {
  it("builds the detail URL with the tab", () => {
    expect(skillHref("sk1", "preview")).toBe("/skills/sk1?tab=preview");
    expect(skillHref("sk1")).toBe("/skills/sk1?tab=config");
  });
});

describe("isSkillType", () => {
  it("accepts a known type and rejects anything else", () => {
    expect(isSkillType("security")).toBe(true);
    expect(isSkillType("linter")).toBe(false);
  });
});

describe("canSaveDraft", () => {
  const ok = { name: "my-skill", description: "Flag x", type: "custom", body: "# Rule" } as const;

  it("accepts a complete draft", () => {
    expect(canSaveDraft(ok)).toBe(true);
  });

  it("rejects an empty name or body, or a name that is not a slug", () => {
    expect(canSaveDraft({ ...ok, name: "  " })).toBe(false);
    expect(canSaveDraft({ ...ok, body: "\n " })).toBe(false);
    expect(canSaveDraft({ ...ok, name: "My Skill" })).toBe(false);
  });
});
