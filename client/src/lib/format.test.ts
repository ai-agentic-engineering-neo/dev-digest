import { describe, it, expect } from "vitest";
import { formatUsd, formatTokenCount, formatTokenFlow, formatRunCost } from "./format";

describe("formatUsd", () => {
  it.each([
    [null, "—"],
    [undefined, "—"],
    [Number.NaN, "—"],
    [0, "$0"],
    [0.0004, "<$0.001"],
    [0.0123, "$0.012"],
    [0.014, "$0.014"],
    [1.5, "$1.50"],
  ])("%s → %s", (v, out) => expect(formatUsd(v)).toBe(out));
});

describe("formatTokenCount", () => {
  it.each([
    [null, "—"],
    [0, "0"],
    [950, "950"],
    [8200, "8.2K"],
    [12000, "12K"],
    [128_400, "128K"],
    [999_999, "1M"],
    [1_300_000, "1.3M"],
  ])("%s → %s", (v, out) => expect(formatTokenCount(v)).toBe(out));
});

describe("formatTokenFlow / formatRunCost", () => {
  it("formats in→out", () => expect(formatTokenFlow(8200, 1300)).toBe("8.2K→1.3K"));
  it("is a dash when neither side is known", () => expect(formatTokenFlow(null, null)).toBe("—"));
  it("full badge", () => expect(formatRunCost(0.014, 8200, 1300)).toBe("$0.014 · 8.2K→1.3K"));
  it("unpriced model keeps tokens", () => expect(formatRunCost(null, 8200, 1300)).toBe("— · 8.2K→1.3K"));
  it("no data at all is a single dash", () => expect(formatRunCost(null, null, null)).toBe("—"));
});
