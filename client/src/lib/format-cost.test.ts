import { describe, expect, it } from "vitest";
import { formatCost } from "./format-cost";

describe("formatCost", () => {
  it("shows a dash for missing data, never $0.00", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("distinguishes a genuinely free run from missing data", () => {
    expect(formatCost(0)).toBe("$0");
  });

  it("keeps sub-cent precision instead of collapsing to $0.00", () => {
    expect(formatCost(0.0002)).toBe("$0.0002");
    expect(formatCost(0.0013)).toBe("$0.0013");
  });

  it("formats typical run costs to 3 significant decimals", () => {
    expect(formatCost(0.012)).toBe("$0.012");
    expect(formatCost(0.06)).toBe("$0.06");
  });

  it("caps larger costs at 2 decimals", () => {
    expect(formatCost(1.2345)).toBe("$1.23");
    expect(formatCost(12.5)).toBe("$12.50");
  });

  it("resolves the $0.01 boundary consistently", () => {
    expect(formatCost(0.01)).toBe("$0.01");
  });
});
