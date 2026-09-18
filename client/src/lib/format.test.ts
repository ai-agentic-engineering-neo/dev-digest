import { describe, it, expect } from "vitest";
import { formatCost, formatTokens } from "./format";

describe("formatCost", () => {
  it("renders unknown cost as an em dash, not $0.00", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("distinguishes a genuinely free run from unknown", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("keeps enough significant digits for small per-run costs", () => {
    expect(formatCost(0.06)).toBe("$0.06");
    expect(formatCost(0.014)).toBe("$0.01");
    expect(formatCost(0.0004)).toBe("$0.0004");
  });

  it("uses plain 2-decimal formatting at/above $1", () => {
    expect(formatCost(1.234)).toBe("$1.23");
    expect(formatCost(12)).toBe("$12.00");
  });
});

describe("formatTokens", () => {
  it("formats an in→out token pair", () => {
    expect(formatTokens(12000, 1500)).toBe("12k→1.5k");
  });
});
