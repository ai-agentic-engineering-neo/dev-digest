import { describe, it, expect } from "vitest";
import { formatCost } from "./cost";

describe("formatCost", () => {
  it("renders missing data as '—', never as '$0.00'", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("renders a genuine zero (free model) as '$0.00'", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("keeps at least three decimals for sub-cent and cent-range runs", () => {
    expect(formatCost(0.012)).toBe("$0.012");
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.003)).toBe("$0.003");
  });

  it("widens precision as the value shrinks instead of rounding to zero", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.000042)).toBe("$0.000042");
  });

  it("trims trailing zeros down to a two-decimal floor", () => {
    expect(formatCost(0.06)).toBe("$0.06");
    expect(formatCost(0.1)).toBe("$0.10");
  });

  it("uses plain two decimals at a dollar and above", () => {
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(12.34)).toBe("$12.34");
  });
});
