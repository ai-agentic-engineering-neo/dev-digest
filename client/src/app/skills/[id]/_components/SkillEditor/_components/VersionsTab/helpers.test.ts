import { describe, it, expect } from "vitest";
import { diffLines, diffStats } from "./helpers";

describe("diffLines", () => {
  it("keeps common lines and marks removed / added ones", () => {
    const diff = diffLines("# A\nold\nkeep", "# A\nnew\nkeep\nmore");
    expect(diff).toEqual([
      { op: "same", text: "# A" },
      { op: "del", text: "old" },
      { op: "add", text: "new" },
      { op: "same", text: "keep" },
      { op: "add", text: "more" },
    ]);
    expect(diffStats(diff)).toEqual({ added: 2, removed: 1 });
  });

  it("reports no changes for identical bodies", () => {
    expect(diffStats(diffLines("a\nb", "a\nb"))).toEqual({ added: 0, removed: 0 });
  });
});
