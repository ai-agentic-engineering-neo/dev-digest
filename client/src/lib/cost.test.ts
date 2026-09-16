/**
 * formatCost — 2 significant digits (2–6 decimals) so sub-cent run costs
 * don't round away to "$0.000"; null is unknown, not free.
 */
import { describe, it, expect } from "vitest";
import { formatCost } from "./cost";

describe("formatCost", () => {
  it("keeps 2 significant digits across magnitudes", () => {
    expect(formatCost(1.256)).toBe("$1.26");
    expect(formatCost(0.06)).toBe("$0.060");
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.00036708)).toBe("$0.00037");
    expect(formatCost(0.0000379)).toBe("$0.000038");
  });

  it("renders unknown cost as an em-dash, never $0.00", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("renders exact zero and floors at 2 decimals", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(123.4)).toBe("$123.40");
  });
});
