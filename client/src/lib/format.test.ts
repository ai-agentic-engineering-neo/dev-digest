/**
 * formatUsd — the cost format is shared by three screens, so the rounding rule
 * lives here rather than in any one of them. The cases that matter are the two
 * that a naive implementation gets wrong: a value whose float representation
 * rounds the wrong way (0.0135), and the "no data" vs "free" distinction.
 */
import { describe, it, expect } from "vitest";
import { formatUsd, formatTokenCount } from "./format";

describe("formatUsd", () => {
  it.each([
    // [usd, expected]
    [0.0135, "$0.014"], // 0.0135 is stored as 0.013499… — toFixed(3) gives "0.013"
    [0.0411, "$0.041"],
    [0.003, "$0.003"],
    [0.00131, "$0.0013"],
    [0.0601, "$0.06"], // trailing zero trimmed back to the 2-decimal floor
    [0.5, "$0.50"], // …but never below it
    [12.345, "$12.35"],
  ])("formats %s as %s", (usd, expected) => {
    expect(formatUsd(usd)).toBe(expected);
  });

  it("renders an exact zero as a price, not as missing data", () => {
    // Some models really are free; that is an answer, not an absence.
    expect(formatUsd(0)).toBe("$0");
  });

  it.each([[null], [undefined]])("renders %s as an em dash, never $0.00", (usd) => {
    expect(formatUsd(usd)).toBe("—");
  });
});

describe("formatTokenCount", () => {
  it("groups thousands", () => {
    expect(formatTokenCount(9119)).toBe("9,119");
  });

  it("renders missing counts as an em dash", () => {
    expect(formatTokenCount(null)).toBe("—");
  });
});
