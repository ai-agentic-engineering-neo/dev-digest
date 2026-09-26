import { describe, it, expect } from "vitest";
import { lineDiff } from "./line-diff";

describe("lineDiff", () => {
  it("returns all-equal when nothing changed", () => {
    const text = "a\nb\nc";
    expect(lineDiff(text, text)).toEqual([
      { type: "equal", text: "a" },
      { type: "equal", text: "b" },
      { type: "equal", text: "c" },
    ]);
  });

  it("marks an appended line as add, keeping the rest equal", () => {
    expect(lineDiff("a\nb", "a\nb\nc")).toEqual([
      { type: "equal", text: "a" },
      { type: "equal", text: "b" },
      { type: "add", text: "c" },
    ]);
  });

  it("marks a removed line as remove, keeping the rest equal", () => {
    expect(lineDiff("a\nb\nc", "a\nc")).toEqual([
      { type: "equal", text: "a" },
      { type: "remove", text: "b" },
      { type: "equal", text: "c" },
    ]);
  });

  it("expresses a same-position replacement as remove + add, not a third op type", () => {
    expect(lineDiff("a\nb\nc", "a\nX\nc")).toEqual([
      { type: "equal", text: "a" },
      { type: "remove", text: "b" },
      { type: "add", text: "X" },
      { type: "equal", text: "c" },
    ]);
  });

  it("handles an empty before (pure insert)", () => {
    expect(lineDiff("", "a")).toEqual([
      { type: "remove", text: "" },
      { type: "add", text: "a" },
    ]);
  });
});
