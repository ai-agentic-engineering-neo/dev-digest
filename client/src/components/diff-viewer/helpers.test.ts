import { describe, it, expect } from "vitest";
import { fileKeys, lineKeys, parsePatch, type Line } from "./helpers";

describe("lineKeys", () => {
  it("keys add/del/ctx lines by their numbers and hunks by their text", () => {
    const lines = parsePatch(["@@ -1,2 +1,2 @@", " same", "-old", "+new"].join("\n"));
    expect(lineKeys(lines)).toEqual(["h@@ -1,2 +1,2 @@", "c1:1", "d2", "a2"]);
  });

  it("separates an add and a del that share a number by the kind prefix", () => {
    const lines: Line[] = [
      { kind: "del", text: "x", oldNo: 5 },
      { kind: "add", text: "y", newNo: 5 },
    ];
    expect(lineKeys(lines)).toEqual(["d5", "a5"]);
  });

  it("suffixes a repeated number instead of producing a duplicate key", () => {
    const lines: Line[] = [
      { kind: "add", text: "a", newNo: 3 },
      { kind: "add", text: "b", newNo: 3 },
      { kind: "ctx", text: "c", oldNo: 1, newNo: 1 },
      { kind: "ctx", text: "c", oldNo: 1, newNo: 1 },
      { kind: "hunk", text: "@@ -1 +1 @@" },
      { kind: "hunk", text: "@@ -1 +1 @@" },
      { kind: "add", text: "c", newNo: 3 },
    ];
    expect(lineKeys(lines)).toEqual([
      "a3",
      "a3#1",
      "c1:1",
      "c1:1#1",
      "h@@ -1 +1 @@",
      "h@@ -1 +1 @@#1",
      "a3#2",
    ]);
  });

  it("returns no keys for no lines", () => {
    expect(lineKeys([])).toEqual([]);
  });
});

describe("fileKeys", () => {
  it("keys files by path and suffixes a repeated path", () => {
    expect(fileKeys([{ path: "a.ts" }, { path: "b.ts" }, { path: "a.ts" }])).toEqual([
      "a.ts",
      "b.ts",
      "a.ts#1",
    ]);
  });
});
