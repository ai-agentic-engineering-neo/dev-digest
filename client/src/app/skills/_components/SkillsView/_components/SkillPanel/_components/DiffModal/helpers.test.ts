import { describe, it, expect } from "vitest";
import { diffLines, diffStats, MAX_DIFF_LINES } from "./helpers";

const kinds = (a: string, b: string) => diffLines(a, b)!.map((l) => `${l.kind}:${l.text}`);

describe("diffLines", () => {
  it("identical text is all context", () => {
    expect(kinds("a\nb", "a\nb")).toEqual(["ctx:a", "ctx:b"]);
    expect(diffStats(diffLines("a\nb", "a\nb")!)).toEqual({ added: 0, removed: 0 });
  });

  it("detects an added line", () => {
    expect(kinds("a\nc", "a\nb\nc")).toEqual(["ctx:a", "add:b", "ctx:c"]);
  });

  it("detects a deleted line", () => {
    expect(kinds("a\nb\nc", "a\nc")).toEqual(["ctx:a", "del:b", "ctx:c"]);
  });

  it("a replaced line is a delete plus an add", () => {
    const out = kinds("a\nOLD\nc", "a\nNEW\nc");
    expect(out).toContain("del:OLD");
    expect(out).toContain("add:NEW");
    expect(out.filter((x) => x.startsWith("ctx"))).toEqual(["ctx:a", "ctx:c"]);
  });

  it("numbers lines on each side", () => {
    const out = diffLines("a\nb", "a\nX\nb")!;
    expect(out).toEqual([
      { kind: "ctx", text: "a", oldNo: 1, newNo: 1 },
      { kind: "add", text: "X", newNo: 2 },
      { kind: "ctx", text: "b", oldNo: 2, newNo: 3 },
    ]);
  });

  it("handles an empty side", () => {
    expect(kinds("", "a")).toEqual(["add:a"]);
    expect(kinds("a", "")).toEqual(["del:a"]);
    expect(diffLines("", "")).toEqual([]);
  });

  it("refuses inputs above the size cap", () => {
    const big = Array.from({ length: MAX_DIFF_LINES + 1 }, (_, i) => `l${i}`).join("\n");
    expect(diffLines(big, "x")).toBeNull();
  });
});
