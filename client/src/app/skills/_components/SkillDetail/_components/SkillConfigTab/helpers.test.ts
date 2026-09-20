import { describe, it, expect } from "vitest";
import { countLines, fileNameFor, lineNumbers } from "./helpers";

describe("editor helpers", () => {
  it("counts lines, including a trailing empty one", () => {
    expect(countLines("")).toBe(1);
    expect(countLines("a\nb\nc")).toBe(3);
    expect(countLines("a\n")).toBe(2);
  });
  it("numbers lines from 1", () => expect(lineNumbers("a\nb")).toEqual([1, 2]));
  it("builds the file name", () => {
    expect(fileNameFor(" pr-rubric ")).toBe("pr-rubric.md");
    expect(fileNameFor("  ")).toBe("skill.md");
  });
});
