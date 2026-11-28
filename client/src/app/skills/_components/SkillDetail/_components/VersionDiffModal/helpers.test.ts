import { describe, it, expect } from "vitest";
import { fieldChanges, lineDiffToPatch } from "./helpers";

describe("lineDiffToPatch", () => {
  it("returns null for identical text", () => {
    expect(lineDiffToPatch("a\nb", "a\nb")).toBeNull();
  });

  it("marks an added line", () => {
    expect(lineDiffToPatch("a\nc", "a\nb\nc")).toEqual({
      patch: "@@ -1,2 +1,3 @@\n a\n+b\n c",
      additions: 1,
      deletions: 0,
    });
  });

  it("marks a deleted line", () => {
    expect(lineDiffToPatch("a\nb\nc", "a\nc")).toEqual({
      patch: "@@ -1,3 +1,2 @@\n a\n-b\n c",
      additions: 0,
      deletions: 1,
    });
  });

  it("handles an empty old body", () => {
    expect(lineDiffToPatch("", "x")?.patch).toBe("@@ -0,0 +1,1 @@\n+x");
  });
});

describe("fieldChanges", () => {
  it("lists only the changed scalar fields", () => {
    const old = { name: "a", description: "d", type: "rubric", body: "x" } as const;
    expect(fieldChanges(old, { ...old, type: "custom", body: "y" })).toEqual([
      { field: "type", from: "rubric", to: "custom" },
    ]);
  });
});
