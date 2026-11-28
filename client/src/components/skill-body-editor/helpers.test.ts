import { describe, it, expect } from "vitest";
import { estimateTokens, lineNumbers, tokenLabel } from "./helpers";

describe("estimateTokens", () => {
  it("rounds chars / 4 up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("tokenLabel", () => {
  it("uses the server count when known", () => {
    expect(tokenLabel("abcdefgh", 166)).toEqual({ key: "tokens", count: 166 });
  });

  it("falls back to an approximate estimate", () => {
    expect(tokenLabel("abcdefghi", null)).toEqual({ key: "tokensApprox", count: 3 });
  });
});

describe("lineNumbers", () => {
  it("numbers every line, at least one", () => {
    expect(lineNumbers("")).toEqual([1]);
    expect(lineNumbers("a\nb\n")).toEqual([1, 2, 3]);
  });
});
