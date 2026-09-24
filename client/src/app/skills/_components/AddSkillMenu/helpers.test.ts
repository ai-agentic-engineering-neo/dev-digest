import { describe, it, expect } from "vitest";
import { readFileAsBase64 } from "./helpers";

describe("readFileAsBase64", () => {
  it("returns the raw base64 of the file, without the data: prefix", async () => {
    const file = new File(["# Rule\nBe kind."], "SKILL.md", { type: "text/markdown" });
    const b64 = await readFileAsBase64(file);
    expect(atob(b64)).toBe("# Rule\nBe kind.");
  });

  it("handles binary content (a zip)", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
    const b64 = await readFileAsBase64(new File([bytes], "skill.zip", { type: "application/zip" }));
    expect(Array.from(atob(b64), (c) => c.charCodeAt(0))).toEqual(Array.from(bytes));
  });
});
