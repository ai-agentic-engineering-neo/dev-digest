import { describe, it, expect } from "vitest";
import type { SmartDiff } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { flaggedCount, groupFiles, totals } from "./helpers";

function file(path: string, additions = 1, deletions = 0): PrFile {
  return { path, additions, deletions, patch: null };
}

function smartDiff(groups: SmartDiff["groups"]): SmartDiff {
  return { groups, split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] } };
}

describe("flaggedCount", () => {
  it("counts only files with at least one finding line", () => {
    expect(flaggedCount([{ finding_lines: [1] }, { finding_lines: [] }, { finding_lines: [2, 3] }])).toBe(2);
    expect(flaggedCount([])).toBe(0);
  });
});

describe("groupFiles", () => {
  it("drops empty groups and orders the non-empty ones as the server did", () => {
    const sd = smartDiff([
      { role: "core", files: [{ path: "a.ts", additions: 1, deletions: 0, finding_lines: [] }] },
      { role: "tests", files: [] },
      { role: "wiring", files: [] },
      { role: "docs", files: [] },
      { role: "boilerplate", files: [{ path: "pnpm-lock.yaml", additions: 1, deletions: 0, finding_lines: [] }] },
    ]);
    const groups = groupFiles([file("a.ts"), file("pnpm-lock.yaml")], sd);
    expect(groups.map((g) => g.role)).toEqual(["core", "boilerplate"]);
  });

  it("matches real PrFiles by path and carries the group's flagged count", () => {
    const sd = smartDiff([
      {
        role: "core",
        files: [
          { path: "a.ts", additions: 1, deletions: 0, finding_lines: [5] },
          { path: "b.ts", additions: 1, deletions: 0, finding_lines: [] },
        ],
      },
    ]);
    const groups = groupFiles([file("a.ts"), file("b.ts")], sd);
    expect(groups[0]).toMatchObject({ role: "core", flaggedCount: 1 });
    expect(groups[0]!.files.map((f) => f.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("puts a file the smart-diff response doesn't know about into core", () => {
    const sd = smartDiff([{ role: "core", files: [{ path: "a.ts", additions: 1, deletions: 0, finding_lines: [] }] }]);
    const groups = groupFiles([file("a.ts"), file("new-file.ts")], sd);
    const core = groups.find((g) => g.role === "core")!;
    expect(core.files.map((f) => f.path)).toEqual(["a.ts", "new-file.ts"]);
  });

  it("falls back to a single core group when smartDiff is not loaded yet", () => {
    const groups = groupFiles([file("a.ts"), file("b.ts")], undefined);
    expect(groups).toEqual([{ role: "core", files: [file("a.ts"), file("b.ts")], flaggedCount: 0 }]);
  });
});

describe("totals", () => {
  it("sums files/additions/deletions", () => {
    expect(totals([file("a.ts", 10, 2), file("b.ts", 3, 1)])).toEqual({ files: 2, additions: 13, deletions: 3 });
    expect(totals([])).toEqual({ files: 0, additions: 0, deletions: 0 });
  });
});
