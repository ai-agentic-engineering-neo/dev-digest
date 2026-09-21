import { describe, it, expect } from "vitest";
import { formatCost } from "./format";

describe("formatCost", () => {
  it("renders a dash for missing data, never $0.00", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("renders a dash for non-finite input instead of throwing or showing $NaN", () => {
    expect(formatCost(NaN)).toBe("—");
    expect(formatCost(Infinity)).toBe("—");
    expect(formatCost(-Infinity)).toBe("—");
  });

  it("renders $0.00 for a genuinely free run (distinct from missing data)", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("uses 4 decimals for sub-cent costs", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
  });

  it("uses 3 decimals at and above one cent", () => {
    expect(formatCost(0.01)).toBe("$0.010");
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(1.5)).toBe("$1.500");
  });
});
