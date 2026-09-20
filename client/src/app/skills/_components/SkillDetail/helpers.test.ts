import { describe, it, expect } from "vitest";
import { parseSkillTab } from "./helpers";

describe("parseSkillTab", () => {
  it("accepts the three tabs", () => {
    expect(parseSkillTab("config")).toBe("config");
    expect(parseSkillTab("preview")).toBe("preview");
    expect(parseSkillTab("stats")).toBe("stats");
  });
  it("falls back to config for unknown or missing values", () => {
    expect(parseSkillTab("evals")).toBe("config");
    expect(parseSkillTab(null)).toBe("config");
    expect(parseSkillTab(undefined)).toBe("config");
  });
});
