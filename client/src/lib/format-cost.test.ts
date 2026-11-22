import { describe, it, expect } from "vitest";
import { formatCost } from "./format-cost";

describe("formatCost", () => {
  it("renders an em-dash for missing cost", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(null, { digits: 4 })).toBe("—");
  });

  it("uses 3 decimals under $1 (tiny sums read $0.000 — no special-casing)", () => {
    expect(formatCost(0)).toBe("$0.000");
    expect(formatCost(0.0004)).toBe("$0.000");
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.0413)).toBe("$0.041");
    expect(formatCost(0.999)).toBe("$0.999");
  });

  it("uses 2 decimals from $1 up", () => {
    expect(formatCost(1)).toBe("$1.00");
    expect(formatCost(1.25)).toBe("$1.25");
    expect(formatCost(12.3456)).toBe("$12.35");
  });

  it("honours an explicit digits override (timeline = 4, trace stat = 2)", () => {
    expect(formatCost(0.0013, { digits: 4 })).toBe("$0.0013");
    expect(formatCost(0.06, { digits: 2 })).toBe("$0.06");
    expect(formatCost(0.062, { digits: 2 })).toBe("$0.06");
  });
});
