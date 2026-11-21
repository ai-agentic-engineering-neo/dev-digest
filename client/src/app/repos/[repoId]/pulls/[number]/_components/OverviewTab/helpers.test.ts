import { describe, it, expect } from "vitest";
import { descriptionPreview, plainText, toSection, wordCount } from "./helpers";

describe("overview helpers", () => {
  it("maps unknown section values to the brief", () => {
    expect(toSection("blast")).toBe("blast");
    expect(toSection("nope")).toBe("brief");
    expect(toSection(null)).toBe("brief");
  });

  it("previews the first meaningful line, skipping a bare heading and HTML comments", () => {
    const body = "## Summary\n\n<!-- template hint -->\nA new **Analytics** page in the [admin](http://x) panel.\n\nMore.";
    expect(descriptionPreview(body)).toBe("A new Analytics page in the admin panel.");
    expect(descriptionPreview("## Add rate limiting to the API\nbody")).toBe("Add rate limiting to the API");
    expect(descriptionPreview("")).toBeNull();
    expect(descriptionPreview("<!-- only a comment -->")).toBeNull();
  });

  it("counts words of the rendered text, not markup", () => {
    expect(wordCount("## Hi\n\n- **one** `two`\n<!-- x y z -->")).toBe(3);
    expect(wordCount(null)).toBe(0);
    expect(plainText("```js\ncode\n```\nok")).toBe("ok");
  });
});
