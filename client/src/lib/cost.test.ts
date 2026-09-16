import { describe, it, expect } from "vitest";
import { formatCost } from "./cost";

describe("formatCost", () => {
  it("returns — for missing cost data", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("returns $0.00 for a genuine free run, not —", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("rounds to 6 decimals then strips trailing zeros down to a floor of 3", () => {
    expect(formatCost(0.013)).toBe("$0.013");
    expect(formatCost(0.000103)).toBe("$0.000103");
    expect(formatCost(0.000013)).toBe("$0.000013");
    expect(formatCost(0.0000131)).toBe("$0.000013");
    expect(formatCost(0.0000135)).toBe("$0.000014");
    expect(formatCost(0.000131)).toBe("$0.000131");
    expect(formatCost(0.0001319)).toBe("$0.000132");
  });

  it("reproduces the mockup values exactly, no padding", () => {
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.0013)).toBe("$0.0013");
  });

  it("carries a value that rounds up to $1 into the dollar format, not $0.100", () => {
    expect(formatCost(0.9999999)).toBe("$1.00");
    expect(formatCost(0.9999995)).toBe("$1.00");
    expect(formatCost(0.99999949)).toBe("$0.999999");
  });

  it("never renders NaN/Infinity", () => {
    expect(formatCost(NaN)).toBe("—");
    expect(formatCost(Infinity)).toBe("—");
    expect(formatCost(-Infinity)).toBe("—");
  });
});
