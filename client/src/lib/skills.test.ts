import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { estimateTokens, filterSkills, formatRate, isThirdPartySource } from "./skills";

const mk = (name: string, description: string): Skill => ({
  id: name,
  name,
  description,
  type: "custom",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
});

describe("filterSkills", () => {
  const list = [mk("test-quality", "Check that tests assert"), mk("api-contract", "Use when routes change")];
  it("returns all for a blank query", () => expect(filterSkills(list, "  ")).toHaveLength(2));
  it("matches name and description case-insensitively", () => {
    expect(filterSkills(list, "TEST").map((s) => s.name)).toEqual(["test-quality"]);
    expect(filterSkills(list, "routes").map((s) => s.name)).toEqual(["api-contract"]);
  });
});

describe("estimateTokens", () => {
  it("is ceil(chars/4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("skill source / rate helpers", () => {
  it("flags third-party sources", () => {
    expect(isThirdPartySource("imported_file")).toBe(true);
    expect(isThirdPartySource("imported_url")).toBe(true);
    expect(isThirdPartySource("community")).toBe(true);
    expect(isThirdPartySource("manual")).toBe(false);
    expect(isThirdPartySource("extracted")).toBe(false);
  });
  it("formats rates with a dash for unknown", () => {
    expect(formatRate(0.714)).toBe("71%");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(null)).toBe("—");
    expect(formatRate(undefined)).toBe("—");
  });
});
