import { describe, it, expect } from "vitest";
import { formatUsd, formatUsdExact, formatTokenCount, formatTokens } from "./format";

describe("formatUsd", () => {
  it.each([
    [null, "—"],
    [undefined, "—"],
    [Number.NaN, "—"],
    [0, "$0.00"],
    [0.00004, "<$0.0001"],
    [0.0001, "$0.0001"],
    [0.001284, "$0.0013"],
    [0.0042, "$0.0042"],
    [0.014, "$0.014"],
    [0.06, "$0.06"],
    [0.37, "$0.37"],
    [0.0999, "$0.10"],
    [0.999, "$1.00"],
    [12.5, "$12.50"],
    [1204.1, "$1,204.10"],
  ])("%s → %s", (v, out) => {
    expect(formatUsd(v as number | null | undefined)).toBe(out);
  });
});

describe("formatUsdExact", () => {
  it("shows 6 decimals", () => expect(formatUsdExact(0.001284)).toBe("$0.001284"));
  it("— when unknown", () => expect(formatUsdExact(null)).toBe("—"));
});

describe("token formatters", () => {
  it("groups a count", () => expect(formatTokenCount(9119)).toBe("9,119"));
  it("summarises in→out", () => expect(formatTokens(15000, 1200)).toBe("15k→1.2k"));
});
