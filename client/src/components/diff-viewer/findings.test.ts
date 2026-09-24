import { describe, it, expect } from "vitest";
import { findingKey, partitionFindings, topSeverity, type DiffFindingItem } from "./findings";
import { parsePatch } from "./helpers";

const PATCH = `@@ -1,2 +1,3 @@
 context
-old line
+new line`;

function item(overrides: Partial<DiffFindingItem> = {}): DiffFindingItem {
  return { id: "f1", file: "a.ts", start_line: 2, severity: "WARNING", ...overrides };
}

describe("findingKey", () => {
  it("anchors on the right (new) line", () => {
    expect(findingKey(2)).toBe("RIGHT:2");
  });
});

describe("partitionFindings", () => {
  const lines = parsePatch(PATCH);

  it("matches a finding whose start_line is a rendered new-line", () => {
    const { matched, unmatched } = partitionFindings([item({ start_line: 2 })], "a.ts", lines);
    expect(matched.get("RIGHT:2")).toHaveLength(1);
    expect(unmatched).toEqual([]);
  });

  it("puts a finding whose line is not in the patch into unmatched", () => {
    const { matched, unmatched } = partitionFindings([item({ start_line: 999 })], "a.ts", lines);
    expect(matched.size).toBe(0);
    expect(unmatched).toHaveLength(1);
  });

  it("ignores findings for a different file", () => {
    const { matched, unmatched } = partitionFindings([item({ file: "b.ts", start_line: 2 })], "a.ts", lines);
    expect(matched.size).toBe(0);
    expect(unmatched).toEqual([]);
  });
});

describe("topSeverity", () => {
  it("returns null for an empty list", () => {
    expect(topSeverity([])).toBeNull();
  });

  it("picks CRITICAL over WARNING and SUGGESTION", () => {
    const items = [item({ severity: "SUGGESTION" }), item({ severity: "CRITICAL" }), item({ severity: "WARNING" })];
    expect(topSeverity(items)).toBe("CRITICAL");
  });
});
