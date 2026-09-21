import { describe, it, expect } from "vitest";
import type { ExtractedSkill } from "./extract";
import { PREVIEW_MAX_CHARS, PREVIEW_MAX_LINES, buildImportPayload, excerptBody, resolveName } from "./helpers";

const extracted = (over: Partial<ExtractedSkill> = {}): ExtractedSkill => ({
  name: "",
  headingName: "",
  description: "",
  body: "body",
  sourceFile: "dir/My Rules.md",
  ignored: [],
  ...over,
});

describe("resolveName", () => {
  it("prefers the typed name, then front-matter, then heading, then the file name", () => {
    expect(resolveName(" typed ", extracted({ name: "fm", headingName: "h" }))).toBe("typed");
    expect(resolveName("", extracted({ name: "fm", headingName: "h" }))).toBe("fm");
    expect(resolveName("", extracted({ headingName: "h" }))).toBe("h");
    expect(resolveName("", extracted())).toBe("my-rules");
  });

  it("is empty with nothing typed and no file", () => {
    expect(resolveName("  ", null)).toBe("");
  });
});

describe("excerptBody", () => {
  it("returns short bodies whole", () => {
    expect(excerptBody("a\nb")).toEqual({ text: "a\nb", hiddenLines: 0 });
  });

  it("cuts long bodies by line count and reports the hidden lines", () => {
    const body = Array.from({ length: PREVIEW_MAX_LINES + 5 }, (_, i) => `l${i}`).join("\n");
    const out = excerptBody(body);
    expect(out.text.split("\n")).toHaveLength(PREVIEW_MAX_LINES);
    expect(out.hiddenLines).toBe(5);
  });

  it("cuts a very long single line by characters", () => {
    const out = excerptBody("x".repeat(PREVIEW_MAX_CHARS * 2));
    expect(out.text).toHaveLength(PREVIEW_MAX_CHARS);
    expect(out.hiddenLines).toBe(0);
  });
});

describe("buildImportPayload", () => {
  it("marks the skill 'extracted' and omits an empty description", () => {
    expect(buildImportPayload("n", "rubric", extracted({ body: "b" }))).toEqual({
      name: "n",
      type: "rubric",
      body: "b",
      source: "extracted",
    });
    expect(buildImportPayload("n", "custom", extracted({ description: "d" }))).toMatchObject({ description: "d" });
  });
});
