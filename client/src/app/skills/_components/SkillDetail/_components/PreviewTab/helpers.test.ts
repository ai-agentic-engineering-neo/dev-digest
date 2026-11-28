import { describe, it, expect } from "vitest";
import { isEmptyBody, previewMarkdown } from "./helpers";

describe("previewMarkdown", () => {
  it("renders heading, italic description, then body", () => {
    expect(previewMarkdown({ name: "rubric", description: "Flag x", type: "rubric", body: "# Body" })).toBe(
      "### rubric\n\n_Flag x_\n\n# Body",
    );
  });

  it("skips an empty description", () => {
    expect(previewMarkdown({ name: "r", description: " ", type: "custom", body: "b" })).toBe("### r\n\nb");
  });
});

describe("isEmptyBody", () => {
  it("treats a whitespace-only body as empty", () => {
    expect(isEmptyBody({ body: " \n" })).toBe(true);
    expect(isEmptyBody({ body: "# Rule" })).toBe(false);
  });
});
