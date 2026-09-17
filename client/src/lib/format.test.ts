import { describe, it, expect } from "vitest";
import { formatCost, formatTokenCount, formatTokens } from "./format";

describe("formatCost", () => {
  it("null/undefined → em dash (unknown, not free)", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("zero → $0.00 (a genuinely free run)", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("formats by significant digits below $1, not toFixed(2)", () => {
    expect(formatCost(0.00039347)).toBe("$0.000393");
    expect(formatCost(0.012)).toBe("$0.012");
    expect(formatCost(0.06)).toBe("$0.06");
    expect(formatCost(0.041)).toBe("$0.041");
    expect(formatCost(0.003)).toBe("$0.003");
    expect(formatCost(0.028)).toBe("$0.028");
    expect(formatCost(0.022)).toBe("$0.022");
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.0014)).toBe("$0.0014");
    expect(formatCost(0.0012)).toBe("$0.0012");
  });

  it("pads to a minimum of 2 decimals below $1", () => {
    expect(formatCost(0.1)).toBe("$0.10");
  });

  it("toFixed(2) at $1 and above", () => {
    expect(formatCost(1.234)).toBe("$1.23");
  });
});

describe("formatTokenCount", () => {
  it("thousands-separates a token total", () => {
    expect(formatTokenCount(9119)).toBe("9,119");
    expect(formatTokenCount(0)).toBe("0");
  });
});

describe("formatTokens", () => {
  it("in→out summary", () => {
    expect(formatTokens(8200, 1300)).toBe("8k→1.3k");
  });
});
