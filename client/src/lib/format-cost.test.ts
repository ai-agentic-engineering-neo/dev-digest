import { describe, it, expect } from "vitest";
import { formatCost } from "./format-cost";

describe("formatCost", () => {
  it("unknown cost renders a dash, never $0.00", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(Number.NaN)).toBe("—");
  });

  it("adapts precision to the amount", () => {
    expect(formatCost(0)).toBe("$0.0000");
    expect(formatCost(0.00123)).toBe("$0.0012");
    expect(formatCost(0.0099)).toBe("$0.0099");
    expect(formatCost(0.01)).toBe("$0.010");
    expect(formatCost(0.0142)).toBe("$0.014");
    expect(formatCost(0.999)).toBe("$0.999");
    expect(formatCost(1)).toBe("$1.00");
    expect(formatCost(1.237)).toBe("$1.24");
  });
});
