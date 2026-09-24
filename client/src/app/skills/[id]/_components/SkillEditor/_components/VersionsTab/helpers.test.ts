import { describe, it, expect } from "vitest";
import { formatWhen, hasChanges, lineDiff } from "./helpers";

describe("lineDiff", () => {
  it("marks removed and added lines against the current body", () => {
    const lines = lineDiff("a\nold\nc\n", "a\nnew\nc\n");
    expect(lines).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "old" },
      { kind: "add", text: "new" },
      { kind: "same", text: "c" },
    ]);
    expect(hasChanges(lines)).toBe(true);
  });

  it("a last line without a trailing newline is not reported as changed", () => {
    expect(lineDiff("a\nb", "a\nb\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
      { kind: "add", text: "c" },
    ]);
  });

  it("reports no change for the same text", () => {
    expect(hasChanges(lineDiff("same\n", "same\n"))).toBe(false);
  });
});

describe("formatWhen", () => {
  it("keeps an unparsable value as-is", () => {
    expect(formatWhen("not a date")).toBe("not a date");
    expect(formatWhen("2026-09-01T10:00:00.000Z")).not.toBe("2026-09-01T10:00:00.000Z");
  });
});
