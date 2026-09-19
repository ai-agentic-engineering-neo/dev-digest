import { describe, it, expect } from "vitest";
import { formatCost, formatTokens } from "./format";

describe("formatCost", () => {
  it("renders unknown cost as an em dash, not $0.00", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("distinguishes a genuinely free run from unknown", () => {
    expect(formatCost(0)).toBe("$0.0000");
  });

  it("defaults to 4 decimals below $1 — every surface (Timeline, trace drawer, PR list) must agree so sums add up", () => {
    expect(formatCost(0.06)).toBe("$0.0600");
    expect(formatCost(0.014)).toBe("$0.0140");
    expect(formatCost(0.0004)).toBe("$0.0004");
    // Still grows past 4 decimals if that many would round to zero.
    expect(formatCost(0.000004)).toBe("$0.000004");
  });

  it("keeps the same decimal floor at/above $1, for the same cross-surface consistency", () => {
    expect(formatCost(1.234)).toBe("$1.2340");
    expect(formatCost(12)).toBe("$12.0000");
    expect(formatCost(1.234, 2)).toBe("$1.23");
  });

  it("a lower minDecimals can still be requested explicitly for a context that wants less precision", () => {
    expect(formatCost(0.014, 2)).toBe("$0.01");
    expect(formatCost(0, 2)).toBe("$0.00");
    expect(formatCost(null, 2)).toBe("—");
  });
});

describe("formatTokens", () => {
  it("sums in+out into a single abbreviated total, not an in→out range", () => {
    expect(formatTokens(12000, 1500)).toBe("13.5k");
    expect(formatTokens(10000, 2000)).toBe("12k"); // drops a trailing .0
    expect(formatTokens(100, 50)).toBe("150"); // under 1000: exact, no "k"
  });
});
