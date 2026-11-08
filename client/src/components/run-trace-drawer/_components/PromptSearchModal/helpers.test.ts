import { describe, it, expect } from "vitest";
import { highlightParts, matchLines } from "./helpers";

describe("matchLines", () => {
  const text = "a\nRate limit\nb(x)*";

  it("keeps lines that contain the query, case-insensitively", () => {
    expect(matchLines(text, "RATE")).toEqual(["Rate limit"]);
  });

  it("matches regex characters literally", () => {
    expect(matchLines(text, "(x)*")).toEqual(["b(x)*"]);
    expect(matchLines(text, ".")).toEqual([]);
  });

  it("returns every line for an empty query", () => {
    expect(matchLines(text, "")).toEqual(["a", "Rate limit", "b(x)*"]);
  });
});

describe("highlightParts", () => {
  it("splits a line into plain and matching parts, preserving case", () => {
    expect(highlightParts("Rate limit per rate", "rate")).toEqual([
      { text: "Rate", match: true },
      { text: " limit per ", match: false },
      { text: "rate", match: true },
    ]);
  });

  it("returns the whole line as plain text for an empty query", () => {
    expect(highlightParts("abc", "")).toEqual([{ text: "abc", match: false }]);
  });
});
