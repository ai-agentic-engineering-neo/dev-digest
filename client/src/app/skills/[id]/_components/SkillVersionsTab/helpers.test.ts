import { describe, it, expect } from "vitest";
import { diffLines, diffStats } from "./helpers";

const render = (lines: ReturnType<typeof diffLines>) =>
  lines.map((l) => `${l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}${l.text}`);

describe("diffLines", () => {
  it("marks every line as context when the bodies are identical", () => {
    const lines = diffLines("a\nb\nc", "a\nb\nc");
    expect(lines.every((l) => l.kind === "ctx")).toBe(true);
    expect(diffStats(lines)).toEqual({ added: 0, removed: 0 });
  });

  it("reports a changed middle line as one removal and one addition", () => {
    const lines = diffLines("a\nb\nc", "a\nB\nc");
    expect(render(lines)).toEqual([" a", "-b", "+B", " c"]);
    expect(diffStats(lines)).toEqual({ added: 1, removed: 1 });
  });

  it("numbers old and new lines independently across an insertion", () => {
    const lines = diffLines("a\nc", "a\nb\nc");
    expect(render(lines)).toEqual([" a", "+b", " c"]);
    // The trailing "c" is line 2 in the old body but line 3 in the new one.
    const last = lines.at(-1)!;
    expect(last).toMatchObject({ kind: "ctx", oldNo: 2, newNo: 3 });
  });

  it("treats a pure deletion as removals only", () => {
    const lines = diffLines("a\nb\nc", "a\nc");
    expect(render(lines)).toEqual([" a", "-b", " c"]);
    expect(diffStats(lines)).toEqual({ added: 0, removed: 1 });
  });

  it("handles an empty body on either side", () => {
    expect(render(diffLines("", "a"))).toEqual(["+a"]);
    expect(render(diffLines("a", ""))).toEqual(["-a"]);
    expect(diffLines("", "")).toEqual([]);
  });

  it("does not treat \\r\\n as a difference from \\n", () => {
    const lines = diffLines("a\r\nb", "a\nb");
    expect(lines.every((l) => l.kind === "ctx")).toBe(true);
  });

  it("keeps a shared head and tail as context around an edited middle", () => {
    const before = "h1\nh2\nx\nt1\nt2";
    const after = "h1\nh2\ny\nz\nt1\nt2";
    expect(render(diffLines(before, after))).toEqual([
      " h1",
      " h2",
      "-x",
      "+y",
      "+z",
      " t1",
      " t2",
    ]);
  });
});
