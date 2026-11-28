import { describe, it, expect } from "vitest";
import { diffLines } from "./helpers";

describe("diffLines", () => {
  it("marks removed and added lines around shared context", () => {
    expect(diffLines("a\nb\nc", "a\nx\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "x" },
      { kind: "same", text: "c" },
    ]);
  });

  it("handles pure additions and identical input", () => {
    expect(diffLines("a", "a\nb").map((o) => o.kind)).toEqual(["same", "add"]);
    expect(diffLines("same", "same")).toEqual([{ kind: "same", text: "same" }]);
  });
});
