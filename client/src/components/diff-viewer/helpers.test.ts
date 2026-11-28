import { describe, expect, it } from "vitest";
import { parsePatch } from "./helpers";

describe("parsePatch", () => {
  it("numbers a normal hunk", () => {
    const lines = parsePatch("@@ -1,2 +1,2 @@\n keep\n-old\n+new");
    expect(lines).toEqual([
      { kind: "hunk", text: "@@ -1,2 +1,2 @@" },
      { kind: "ctx", text: "keep", oldNo: 1, newNo: 1 },
      { kind: "del", text: "old", oldNo: 2 },
      { kind: "add", text: "new", newNo: 2 },
    ]);
  });

  it("ignores the no-newline marker and the trailing empty string", () => {
    const lines = parsePatch(
      "@@ -1,2 +1,2 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n c\n",
    );
    expect(lines.map((l) => l.kind)).toEqual(["hunk", "del", "add", "ctx"]);
    expect(lines[3]).toMatchObject({ text: "c", oldNo: 2, newNo: 2 });
  });
});
