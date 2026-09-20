import { describe, expect, it } from "vitest";
import { estimateTokens } from "./helpers";

describe("estimateTokens", () => {
  it("is ~4 characters per token, rounded up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});
