import { describe, it, expect } from "vitest";
import { formatCostUsd, formatTokenCount, formatTokensArrow } from "./format-cost";

describe("formatCostUsd", () => {
  it("renders unknown as a dash, never $0.00", () => {
    expect(formatCostUsd(null)).toBe("—");
    expect(formatCostUsd(undefined)).toBe("—");
    expect(formatCostUsd(Number.NaN)).toBe("—");
  });

  it("keeps a real zero (free model) as $0.00", () => {
    expect(formatCostUsd(0)).toBe("$0.00");
  });

  it("uses 2 significant digits below $1 (matches the designs)", () => {
    expect(formatCostUsd(0.0137)).toBe("$0.014");
    expect(formatCostUsd(0.00131)).toBe("$0.0013");
    expect(formatCostUsd(0.06)).toBe("$0.06");
    expect(formatCostUsd(0.1)).toBe("$0.10");
  });

  it("uses cents at/above $1 and floors dust", () => {
    expect(formatCostUsd(1.2678)).toBe("$1.27");
    expect(formatCostUsd(0.0000012)).toBe("<$0.0001");
  });
});

describe("token formatters", () => {
  it("groups thousands with a thin space", () => {
    expect(formatTokenCount(9119)).toBe("9 119");
    expect(formatTokenCount(1234567)).toBe("1 234 567");
    expect(formatTokenCount(42)).toBe("42");
    expect(formatTokenCount(null)).toBe("—");
  });

  it("formats in→out in K", () => {
    expect(formatTokensArrow(8200, 1300)).toBe("8.2K→1.3K");
    expect(formatTokensArrow(950, 40)).toBe("950→40");
    expect(formatTokensArrow(null, 10)).toBe("—");
  });
});
