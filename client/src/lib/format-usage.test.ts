import { describe, it, expect } from "vitest";
import { formatTokens, formatUsd, formatUsdExact } from "./format-usage";

describe("formatUsd", () => {
  it.each([
    [null, "—"],
    [undefined, "—"],
    [Number.NaN, "—"],
    [0, "$0.00"],
    [0.00004, "<$0.0001"],
    [0.0013, "$0.0013"],
    [0.001312, "$0.0013"],
    [0.014, "$0.014"],
    [0.06, "$0.06"],
    [0.1, "$0.10"],
    [0.00012, "$0.00012"],
    [1.2345, "$1.23"],
    [12, "$12.00"],
  ])("%s → %s", (input, expected) => {
    expect(formatUsd(input)).toBe(expected);
  });
});

describe("formatUsdExact", () => {
  it("full precision for tooltips, empty when unknown", () => {
    expect(formatUsdExact(0.001312)).toBe("$0.001312");
    expect(formatUsdExact(null)).toBe("");
  });
});

describe("formatTokens", () => {
  it("in→out in k", () => {
    expect(formatTokens(12000, 1500)).toBe("12k→1.5k");
  });
});
