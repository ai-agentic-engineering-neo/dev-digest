import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  formatRate,
  isValidSkillName,
  resolvePreviewId,
  resolveSkillTab,
  skillBlockHeader,
  skillHref,
  skillsHref,
} from "./helpers";

describe("skills route helpers", () => {
  it("resolveSkillTab keeps a known tab and falls back to config", () => {
    expect(resolveSkillTab("versions")).toBe("versions");
    expect(resolveSkillTab(["stats", "config"])).toBe("stats");
    expect(resolveSkillTab(undefined)).toBe("config");
    expect(resolveSkillTab("evals")).toBe("config");
  });

  it("resolvePreviewId treats an empty value as no drawer", () => {
    expect(resolvePreviewId("sk1")).toBe("sk1");
    expect(resolvePreviewId("")).toBeNull();
    expect(resolvePreviewId(undefined)).toBeNull();
  });

  it("builds list and editor URLs", () => {
    expect(skillsHref()).toBe("/skills");
    expect(skillsHref("sk 1")).toBe("/skills?preview=sk+1");
    expect(skillHref("sk1")).toBe("/skills/sk1?tab=config");
    expect(skillHref("sk1", "versions")).toBe("/skills/sk1?tab=versions");
  });
});

describe("skill rules", () => {
  it("isValidSkillName follows the contract slug rule", () => {
    expect(isValidSkillName("pr-quality-rubric")).toBe(true);
    expect(isValidSkillName("a1")).toBe(true);
    expect(isValidSkillName("")).toBe(false);
    expect(isValidSkillName("Has Caps")).toBe(false);
    expect(isValidSkillName("double--dash")).toBe(false);
    expect(isValidSkillName("-lead")).toBe(false);
    expect(isValidSkillName("a".repeat(65))).toBe(false);
  });

  it("estimateTokens is ceil(len / 4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("formatRate renders a percent or null", () => {
    expect(formatRate(0.426)).toBe("43%");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(null)).toBeNull();
  });
});

describe("skillBlockHeader", () => {
  it("mirrors the prompt block header; no Applies-when line without a description", () => {
    expect(skillBlockHeader("no-then-chains", "Flag .then chains.")).toBe(
      "### no-then-chains\n_Applies when:_ Flag .then chains.",
    );
    expect(skillBlockHeader("no-then-chains", "  ")).toBe("### no-then-chains");
  });
});
