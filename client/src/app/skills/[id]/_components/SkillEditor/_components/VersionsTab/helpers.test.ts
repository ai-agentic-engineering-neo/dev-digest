import { describe, it, expect } from "vitest";
import { diffLines } from "./helpers";

describe("diffLines", () => {
  it("marks a changed line as removed then added", () => {
    const diff = diffLines("hello\nworld", "hello\nthere");
    expect(diff).toEqual([
      { kind: "ctx", text: "hello", oldNo: 1, newNo: 1 },
      { kind: "del", text: "world", oldNo: 2 },
      { kind: "add", text: "there", newNo: 2 },
    ]);
  });

  it("keeps identical bodies as context", () => {
    expect(diffLines("same", "same")).toEqual([{ kind: "ctx", text: "same", oldNo: 1, newNo: 1 }]);
  });
});
