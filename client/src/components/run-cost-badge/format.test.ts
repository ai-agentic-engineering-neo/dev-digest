import { describe, it, expect } from "vitest";
import { formatRunCost, formatTokenCount } from "./format";

describe("formatRunCost", () => {
  it("renders null/undefined as an em dash, never $0.00", () => {
    expect(formatRunCost(null)).toBe("—");
    expect(formatRunCost(undefined)).toBe("—");
  });

  it("renders a real zero cost as $0.00", () => {
    expect(formatRunCost(0)).toBe("$0.00");
  });

  it("floors sub-$0.0001 costs", () => {
    expect(formatRunCost(0.00003)).toBe("<$0.0001");
  });

  it("shows 4 decimals under a cent", () => {
    expect(formatRunCost(0.0013)).toBe("$0.0013");
    expect(formatRunCost(0.0012)).toBe("$0.0012");
  });

  it("shows 3 decimals under a dollar", () => {
    expect(formatRunCost(0.014)).toBe("$0.014");
    expect(formatRunCost(0.06)).toBe("$0.060");
  });

  it("shows 2 decimals at a dollar or more", () => {
    expect(formatRunCost(1.2)).toBe("$1.20");
    expect(formatRunCost(12)).toBe("$12.00");
  });
});

describe("formatTokenCount", () => {
  it("sums in+out with thousands separators", () => {
    expect(formatTokenCount(8119, 1000)).toBe("9,119 tok");
  });

  it("handles zero", () => {
    expect(formatTokenCount(0, 0)).toBe("0 tok");
  });
});
