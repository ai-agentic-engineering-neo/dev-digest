import { describe, it, expect } from "vitest";
import { formatCost, formatTokenTotal, totalTokens } from "./format-cost";

describe("formatCost — adaptive precision", () => {
  it("no data renders an em dash, never $0.00", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(Number.NaN)).toBe("—");
  });

  it("zero is a real price (free model)", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("ten cents or more uses two decimals", () => {
    expect(formatCost(1.234)).toBe("$1.23");
    expect(formatCost(0.1)).toBe("$0.10");
    expect(formatCost(0.099)).toBe("$0.099");
    expect(formatCost(12)).toBe("$12.00");
  });

  it("below ten cents keeps two significant digits", () => {
    expect(formatCost(0.06)).toBe("$0.06");
    expect(formatCost(0.012)).toBe("$0.012");
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.0107)).toBe("$0.011");
    expect(formatCost(0.00999)).toBe("$0.01");
    expect(formatCost(0.005)).toBe("$0.005");
    expect(formatCost(0.0000042)).toBe("$0.0000042");
  });
});

describe("token helpers", () => {
  it("formats totals with thousands separators", () => {
    expect(formatTokenTotal(9119)).toBe("9,119");
    expect(formatTokenTotal(150)).toBe("150");
    expect(formatTokenTotal(1234567)).toBe("1,234,567");
  });

  it("totalTokens is null only when both sides are unknown", () => {
    expect(totalTokens(8190, 929)).toBe(9119);
    expect(totalTokens(null, null)).toBeNull();
    expect(totalTokens(undefined, 5)).toBe(5);
  });
});
