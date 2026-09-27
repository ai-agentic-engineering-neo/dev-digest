import { describe, it, expect } from "vitest";
import { collapseUnchanged, diffLines, diffStat } from "./helpers";

/**
 * The Diff button's whole substance is this function, and its failure mode is
 * quiet: a diff that marks unchanged lines as changed still renders.
 */

describe("diffLines", () => {
  it("reports nothing changed when the bodies match", () => {
    const lines = diffLines("a\nb\nc", "a\nb\nc");
    expect(lines.every((l) => l.op === "same")).toBe(true);
    expect(diffStat(lines)).toEqual({ added: 0, removed: 0 });
  });

  it("marks an inserted line as added and leaves its neighbours alone", () => {
    const lines = diffLines("a\nc", "a\nb\nc");
    expect(lines).toEqual([
      { op: "same", text: "a" },
      { op: "add", text: "b" },
      { op: "same", text: "c" },
    ]);
  });

  it("marks a deleted line as removed", () => {
    const lines = diffLines("a\nb\nc", "a\nc");
    expect(diffStat(lines)).toEqual({ added: 0, removed: 1 });
    expect(lines.find((l) => l.op === "remove")?.text).toBe("b");
  });

  it("reads an edited line as one removal plus one addition", () => {
    const lines = diffLines("rule: old", "rule: new");
    expect(diffStat(lines)).toEqual({ added: 1, removed: 1 });
  });

  it("handles an empty side", () => {
    expect(diffStat(diffLines("", "a\nb"))).toEqual({ added: 2, removed: 1 });
    expect(diffStat(diffLines("a\nb", ""))).toEqual({ added: 1, removed: 2 });
  });
});

describe("collapseUnchanged", () => {
  it("keeps context around each change and elides the rest", () => {
    const before = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
    const after = before.replace("line 15", "line fifteen");
    const collapsed = collapseUnchanged(diffLines(before, after));

    expect(collapsed.some((l) => l.text === "…")).toBe(true);
    expect(collapsed.some((l) => l.op === "add" && l.text === "line fifteen")).toBe(true);
    expect(collapsed.length).toBeLessThan(30);
  });

  it("leaves a short diff untouched", () => {
    const lines = diffLines("a\nb", "a\nc");
    expect(collapseUnchanged(lines)).toEqual(lines);
  });
});
