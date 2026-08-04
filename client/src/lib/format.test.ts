import { describe, it, expect } from "vitest";
import { formatCost, formatCostPair } from "./format";

describe("formatCost", () => {
  it("returns the em dash for null/undefined (unknown cost)", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("returns 'Free' for an exact zero (known-zero-cost model)", () => {
    expect(formatCost(0)).toBe("Free");
  });

  it("returns '<$0.001' for a nonzero cost that rounds to zero at 3dp", () => {
    expect(formatCost(0.0004)).toBe("<$0.001");
  });

  it("formats to 3 decimal places otherwise", () => {
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(1.5)).toBe("$1.500");
  });
});

describe("formatCostPair", () => {
  it("shows the em dash when there are no runs at all", () => {
    expect(formatCostPair(null, null)).toBe("—");
    expect(formatCostPair(undefined, undefined)).toBe("—");
  });

  it("shows only the total when the latest run's cost is unknown", () => {
    expect(formatCostPair(null, 0.041)).toBe("$0.041");
  });

  it("collapses to a single value when latest equals total (one run so far)", () => {
    expect(formatCostPair(0.014, 0.014)).toBe("$0.014");
  });

  it("collapses to 'Free' when every run so far was free (latest === total === 0)", () => {
    expect(formatCostPair(0, 0)).toBe("Free");
  });

  it("shows latest and total together when they differ", () => {
    expect(formatCostPair(0.014, 0.041)).toBe("$0.014 ($0.041)");
  });

  it("does NOT collapse 'latest is free, but earlier runs cost something'", () => {
    expect(formatCostPair(0, 0.02)).toBe("Free ($0.020)");
  });
});
