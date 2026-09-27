import { describe, it, expect } from "vitest";
import { resolveSkillTab, skillHref } from "./helpers";

describe("skill addresses", () => {
  it("puts the skill in the path and the tab in the query", () => {
    expect(skillHref("abc", "preview")).toBe("/skills/abc?tab=preview");
  });

  it("opens Config when the requested tab does not exist", () => {
    expect(skillHref("abc", "evals")).toBe("/skills/abc?tab=config");
    expect(resolveSkillTab(null)).toBe("config");
  });

  it("encodes the id, so a strange one cannot break out of the path", () => {
    expect(skillHref("a/b?c", "config")).toBe("/skills/a%2Fb%3Fc?tab=config");
  });
});
