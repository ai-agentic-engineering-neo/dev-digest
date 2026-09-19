import { describe, it, expect } from "vitest";
import type { SkillSummary } from "@devdigest/shared";
import { diffLines, filterSkills, formatDate, formatRatio, isValidSkillName } from "./helpers";

describe("isValidSkillName (D3 slug rule)", () => {
  it("accepts lowercase, digits and internal hyphens starting with a letter or digit", () => {
    expect(isValidSkillName("pr-quality-rubric")).toBe(true);
    expect(isValidSkillName("a1")).toBe(true);
    expect(isValidSkillName("test-coverage-nudge")).toBe(true);
  });

  it("rejects empty, uppercase, spaces, leading hyphen and single characters", () => {
    expect(isValidSkillName("")).toBe(false);
    expect(isValidSkillName("Pr-Quality")).toBe(false);
    expect(isValidSkillName("pr quality")).toBe(false);
    expect(isValidSkillName("-pr-quality")).toBe(false);
    expect(isValidSkillName("a")).toBe(false);
  });
});

describe("filterSkills", () => {
  const skills = [
    { name: "test-coverage-nudge", description: "every new branch needs an assertion" },
    { name: "mocking-smells", description: "a mock that encodes the implementation" },
  ] as SkillSummary[];

  it("matches by name or description, case-insensitively, and returns all on empty query", () => {
    expect(filterSkills(skills, "")).toHaveLength(2);
    expect(filterSkills(skills, "MOCKING")).toEqual([skills[1]]);
    expect(filterSkills(skills, "assertion")).toEqual([skills[0]]);
    expect(filterSkills(skills, "nonexistent")).toHaveLength(0);
  });
});

describe("formatRatio", () => {
  it("renders an em dash for a null denominator, never 0%", () => {
    expect(formatRatio(null)).toBe("—");
  });

  it("renders a rounded percentage otherwise", () => {
    expect(formatRatio(0.5)).toBe("50%");
    expect(formatRatio(0)).toBe("0%");
    expect(formatRatio(1)).toBe("100%");
  });
});

describe("formatDate", () => {
  it("formats a valid ISO date and falls back to the raw string otherwise", () => {
    expect(formatDate("2026-01-15T00:00:00.000Z")).toContain("2026");
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("diffLines (LCS line diff)", () => {
  it("marks unchanged lines as equal", () => {
    const d = diffLines("a\nb\nc", "a\nb\nc");
    expect(d).toEqual([
      { op: "equal", text: "a" },
      { op: "equal", text: "b" },
      { op: "equal", text: "c" },
    ]);
  });

  it("detects an added line", () => {
    const d = diffLines("a\nc", "a\nb\nc");
    expect(d).toEqual([
      { op: "equal", text: "a" },
      { op: "add", text: "b" },
      { op: "equal", text: "c" },
    ]);
  });

  it("detects a removed line", () => {
    const d = diffLines("a\nb\nc", "a\nc");
    expect(d).toEqual([
      { op: "equal", text: "a" },
      { op: "remove", text: "b" },
      { op: "equal", text: "c" },
    ]);
  });

  it("handles a full replacement", () => {
    const d = diffLines("old body", "new body");
    expect(d.some((l) => l.op === "remove" && l.text === "old body")).toBe(true);
    expect(d.some((l) => l.op === "add" && l.text === "new body")).toBe(true);
  });
});
