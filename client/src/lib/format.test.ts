import { describe, it, expect } from "vitest";
import { formatCost } from "./format";

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
