import { describe, it, expect } from "vitest";
import { hasChanges, toDiffLines } from "./helpers";

describe("toDiffLines", () => {
  it("marks removed, added and unchanged lines from old → current", () => {
    expect(toDiffLines("a\nb\nc\n", "a\nB\nc\n")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "B" },
      { kind: "same", text: "c" },
    ]);
  });

  it("reports no changes for identical bodies", () => {
    expect(hasChanges(toDiffLines("x\ny", "x\ny"))).toBe(false);
  });
});
