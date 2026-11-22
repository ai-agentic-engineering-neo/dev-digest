import { describe, it, expect } from "vitest";
import { formatCost, formatTokenCount, NO_COST } from "./format-cost";

describe("formatCost", () => {
  it("renders '-' for missing data, never $0.00", () => {
    expect(formatCost(null)).toBe(NO_COST);
    expect(formatCost(undefined)).toBe(NO_COST);
    expect(formatCost(Number.NaN)).toBe(NO_COST);
    expect(formatCost(null)).not.toBe("$0.00");
  });

  it("uses 4 decimals under one cent", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
  });

  it("uses 3 decimals under one dollar", () => {
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.041)).toBe("$0.041");
  });

  it("uses 2 decimals from one dollar up", () => {
    expect(formatCost(1.5)).toBe("$1.50");
  });

  it("keeps a real zero from a free model as a number", () => {
    expect(formatCost(0)).toBe("$0.0000");
  });
});

describe("formatTokenCount", () => {
  it("adds thousands separators", () => {
    expect(formatTokenCount(9119)).toBe("9,119");
    expect(formatTokenCount(42)).toBe("42");
  });
});
