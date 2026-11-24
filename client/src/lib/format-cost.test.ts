import { describe, it, expect } from "vitest";
import { formatCost, formatTokensInOut } from "./format-cost";

describe("formatCost", () => {
  it("shows a dash — never $0.00 — when there is no data", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(Number.NaN)).toBe("—");
  });
  it("shows $0.00 only for a real zero", () => expect(formatCost(0)).toBe("$0.00"));
  it("scales decimals with magnitude", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(1.254)).toBe("$1.25");
  });
  it("never shows a priced run as $0.0000", () => {
    expect(formatCost(0.00001)).toBe("<$0.0001");
  });
  it("picks the bracket after rounding", () => {
    expect(formatCost(0.9996)).toBe("$1.00");
    expect(formatCost(0.009996)).toBe("$0.010");
  });
});

describe("formatTokensInOut", () => {
  it("compacts in→out", () => {
    expect(formatTokensInOut(8200, 1300)).toBe("8.2K→1.3K");
    expect(formatTokensInOut(950, 40)).toBe("950→40");
  });
});
