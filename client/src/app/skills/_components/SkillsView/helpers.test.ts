import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { buildSkillsHref, resolveSelectedId } from "./helpers";

const mk = (id: string): Skill => ({
  id,
  name: id,
  description: "d",
  type: "custom",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
});

describe("resolveSelectedId", () => {
  const list = [mk("a"), mk("b")];
  it("keeps a valid id", () => expect(resolveSelectedId(list, "b")).toBe("b"));
  it("falls back to the first skill for a stale or missing id", () => {
    expect(resolveSelectedId(list, "gone")).toBe("a");
    expect(resolveSelectedId(list, null)).toBe("a");
  });
  it("is null when there are no skills", () => expect(resolveSelectedId([], "a")).toBeNull());
});

describe("buildSkillsHref", () => {
  it("encodes id and tab", () => expect(buildSkillsHref("x-1", "preview")).toBe("/skills?id=x-1&tab=preview"));
  it("omits the id when nothing is selected", () => expect(buildSkillsHref(null, "config")).toBe("/skills?tab=config"));
});
