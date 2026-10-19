import { describe, it, expect } from "vitest";
import { formatCost, formatTokenCount } from "./format-cost";

describe("formatCost", () => {
  it("renders missing cost as a dash, never $0.00", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(Number.NaN)).toBe("—");
  });

  it("keeps 2 significant digits below $1", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.01412)).toBe("$0.014");
    expect(formatCost(0.06)).toBe("$0.06");
    expect(formatCost(0.000012345)).toBe("$0.000012");
  });

  it("uses 2 decimals from $1 up", () => {
    expect(formatCost(1.237)).toBe("$1.24");
    expect(formatCost(12)).toBe("$12.00");
  });
});

describe("formatTokenCount", () => {
  it("groups thousands with a space", () => {
    expect(formatTokenCount(9119)).toBe("9 119");
    expect(formatTokenCount(12011)).toBe("12 011");
    expect(formatTokenCount(950)).toBe("950");
    expect(formatTokenCount(1234567)).toBe("1 234 567");
  });
});
