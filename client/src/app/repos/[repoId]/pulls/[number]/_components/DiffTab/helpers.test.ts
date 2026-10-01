import { describe, it, expect } from "vitest";
import type { PrFile, SmartDiffGroup } from "@devdigest/shared";
import { orderFilesByGroups, flaggedPathsOf, diffTotals, uniqueByPath } from "./helpers";

const file = (path: string, additions = 1, deletions = 0): PrFile => ({ path, additions, deletions, patch: "" }) as PrFile;
const sd = (path: string, finding_lines: number[] = []) => ({ path, additions: 1, deletions: 0, finding_lines });

const files = [file("a.ts"), file("b.test.ts"), file("c.ts"), file("README.md"), file("extra.ts")];
const groups: SmartDiffGroup[] = [
  { role: "core", files: [sd("c.ts", [3]), sd("a.ts"), sd("ghost.ts")] },
  { role: "tests", files: [sd("b.test.ts")] },
  { role: "docs", files: [sd("README.md")] },
];

describe("orderFilesByGroups", () => {
  it("keeps GitHub order in a group, drops unknown paths, appends orphans to core", () => {
    const out = orderFilesByGroups(groups, files);
    expect(out.map((g) => g.role)).toEqual(["core", "tests", "docs"]);
    expect(out[0]!.files.map((f) => f.path)).toEqual(["a.ts", "c.ts", "extra.ts"]);
    expect(out[0]!.flaggedCount).toBe(1);
  });

  it("creates a core group when the server sent none", () => {
    const out = orderFilesByGroups([], files);
    expect(out).toHaveLength(1);
    expect(out[0]!.files).toHaveLength(5);
  });
});

describe("flaggedPathsOf / diffTotals", () => {
  it("flags only paths with finding lines", () => {
    expect([...flaggedPathsOf(groups)]).toEqual(["c.ts"]);
  });
  it("sums totals", () => {
    expect(diffTotals([file("x", 3, 1), file("y", 2, 4)])).toEqual({ count: 2, additions: 5, deletions: 5 });
  });
});

describe("uniqueByPath", () => {
  it("keeps the first file per path and preserves order", () => {
    expect(uniqueByPath([file("a.ts"), file("CLAUDE.md"), file("a.ts"), file("CLAUDE.md"), file("b.ts")]).map((f) => f.path)).toEqual([
      "a.ts",
      "CLAUDE.md",
      "b.ts",
    ]);
  });
});
