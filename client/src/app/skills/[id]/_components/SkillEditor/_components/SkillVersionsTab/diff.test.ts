import { describe, it, expect } from "vitest";
import { countChanges, diffLines, withContext, type DiffLine } from "./diff";

const shape = (lines: DiffLine[]) => lines.map((l) => `${l.type[0]}:${l.text}`);

describe("diffLines", () => {
  it("marks an edited line as a removal followed by an addition, with line numbers", () => {
    const d = diffLines("a\nb\nc", "a\nB\nc")!;
    expect(shape(d)).toEqual(["s:a", "d:b", "a:B", "s:c"]);
    expect(d[1]).toMatchObject({ oldNo: 2, newNo: null });
    expect(d[2]).toMatchObject({ oldNo: null, newNo: 2 });
    expect(d[3]).toMatchObject({ oldNo: 3, newNo: 3 });
  });

  it("handles pure insertions, deletions, empty sides, CRLF and trailing newlines", () => {
    expect(shape(diffLines("a\nc", "a\nb\nc")!)).toEqual(["s:a", "a:b", "s:c"]);
    expect(shape(diffLines("a\nb\nc", "a\nc")!)).toEqual(["s:a", "d:b", "s:c"]);
    expect(shape(diffLines("", "x\ny")!)).toEqual(["a:x", "a:y"]);
    expect(shape(diffLines("x", "")!)).toEqual(["d:x"]);
    expect(diffLines("a\r\nb\n", "a\nb")!.every((l) => l.type === "same")).toBe(true);
    expect(diffLines("", "")).toEqual([]);
  });

  it("finds the LCS across interleaved changes", () => {
    const d = diffLines("1\n2\n3\n4\n5", "1\n3\n4\nx\n5")!;
    expect(shape(d)).toEqual(["s:1", "d:2", "s:3", "s:4", "a:x", "s:5"]);
    expect(countChanges(d)).toEqual({ added: 1, removed: 1 });
  });

  it("returns null when the changed region is too large to diff", () => {
    const big = (p: string) => Array.from({ length: 2500 }, (_, i) => `${p}${i}`).join("\n");
    expect(diffLines(big("a"), big("b"))).toBeNull();
  });
});

describe("withContext", () => {
  it("collapses long unchanged runs but keeps context around changes", () => {
    const old = Array.from({ length: 20 }, (_, i) => `l${i}`);
    const next = [...old];
    next[10] = "CHANGED";
    const out = withContext(diffLines(old.join("\n"), next.join("\n"))!, 2);
    const gaps = out.filter((x) => x.type === "gap");
    expect(gaps).toEqual([
      { type: "gap", count: 8 },
      { type: "gap", count: 7 },
    ]);
    expect(out.filter((x) => x.type !== "gap")).toHaveLength(6); // 2 context + removed + added + 2 context
  });

  it("does not collapse a single unchanged line into a gap", () => {
    const out = withContext(diffLines("a\nb\nc\nd\ne", "A\nb\nc\nd\nE")!, 1);
    expect(out.some((x) => x.type === "gap")).toBe(false);
  });
});
