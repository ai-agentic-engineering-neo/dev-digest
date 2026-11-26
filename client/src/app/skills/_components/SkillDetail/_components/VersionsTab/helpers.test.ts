import { describe, it, expect } from "vitest";
import type { SkillVersion } from "@devdigest/shared";
import { formatDay, lineDiff, sortNewestFirst } from "./helpers";

describe("lineDiff", () => {
  it("returns no lines for two empty bodies and only adds/dels against an empty side", () => {
    expect(lineDiff("", "")).toEqual([]);
    expect(lineDiff("", "a\nb")).toEqual([
      { kind: "add", text: "a" },
      { kind: "add", text: "b" },
    ]);
    expect(lineDiff("a", "")).toEqual([{ kind: "del", text: "a" }]);
  });

  it("marks every line same for identical bodies", () => {
    expect(lineDiff("a\nb\nc", "a\nb\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
      { kind: "same", text: "c" },
    ]);
  });

  it("detects an inserted line in the middle", () => {
    expect(lineDiff("a\nc", "a\nb\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "add", text: "b" },
      { kind: "same", text: "c" },
    ]);
  });

  it("detects a deleted line", () => {
    expect(lineDiff("a\nb\nc", "a\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "same", text: "c" },
    ]);
  });

  it("shows a replaced line as del then add, keeping the context", () => {
    expect(lineDiff("# Rule\nno secrets\nend", "# Rule\nno tokens\nend")).toEqual([
      { kind: "same", text: "# Rule" },
      { kind: "del", text: "no secrets" },
      { kind: "add", text: "no tokens" },
      { kind: "same", text: "end" },
    ]);
  });

  it("treats CRLF and LF line endings alike", () => {
    expect(lineDiff("a\r\nb", "a\nb").every((line) => line.kind === "same")).toBe(true);
  });
});

describe("sortNewestFirst / formatDay", () => {
  it("orders by version descending without mutating the input", () => {
    const v = (version: number): SkillVersion => ({
      skill_id: "sk1",
      version,
      body: "",
      message: "",
      created_at: "2026-11-01T00:00:00Z",
    });
    const input = [v(1), v(3), v(2)];
    expect(sortNewestFirst(input).map((x) => x.version)).toEqual([3, 2, 1]);
    expect(input.map((x) => x.version)).toEqual([1, 3, 2]);
  });

  it("formats an ISO timestamp as YYYY-MM-DD and falls back to —", () => {
    expect(formatDay("2026-11-24T23:10:00Z")).toBe("2026-11-24");
    expect(formatDay("nope")).toBe("—");
  });
});
