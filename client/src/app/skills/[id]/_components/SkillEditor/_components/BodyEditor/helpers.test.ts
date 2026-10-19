import { describe, it, expect } from "vitest";
import { classifyLines } from "./helpers";

describe("classifyLines", () => {
  it("tints headings and fenced code, keeping one entry per line", () => {
    const body = "# Rubric\n\ntext\n```ts\n# not a heading\n```\n## Tests";
    expect(classifyLines(body).map((l) => l.kind)).toEqual([
      "heading",
      "text",
      "text",
      "fence",
      "fence",
      "fence",
      "heading",
    ]);
  });

  it("keeps a trailing empty line so the gutter matches the textarea", () => {
    expect(classifyLines("a\n")).toHaveLength(2);
  });
});
