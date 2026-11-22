import { describe, it, expect } from "vitest";
import { formatCost } from "./helpers";

describe("formatCost", () => {
  it("renders em-dash for null / undefined / exactly 0", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(0)).toBe("—");
  });

  it("renders 3 significant digits for sub-cent values", () => {
    expect(formatCost(0.00123)).toBe("$0.00123");
    expect(formatCost(0.012)).toBe("$0.012");
    expect(formatCost(0.145)).toBe("$0.145");
  });

  it("renders 3 significant digits for values ≥ $1", () => {
    expect(formatCost(1.234)).toBe("$1.23");
    expect(formatCost(12.345)).toBe("$12.3");
  });

  it("never emits scientific notation (ultra-tiny costs fall back to fixed-decimal)", () => {
    const out = formatCost(1.23e-7);
    expect(out).not.toMatch(/e/i);
    expect(out.startsWith("$")).toBe(true);
  });
});
