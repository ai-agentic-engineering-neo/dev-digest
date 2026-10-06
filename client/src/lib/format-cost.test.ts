import { describe, it, expect } from "vitest";
import { formatTokenCount, formatUsd } from "./format-cost";

describe("formatUsd", () => {
  it("unknown cost is an em dash, never $0.00", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(undefined)).toBe("—");
  });

  it("a genuinely free run is $0", () => {
    expect(formatUsd(0)).toBe("$0");
  });

  it("keeps ≥3 significant digits for small amounts", () => {
    expect(formatUsd(0.0013)).toBe("$0.0013");
    expect(formatUsd(0.00131)).toBe("$0.00131");
    expect(formatUsd(0.014)).toBe("$0.014");
    expect(formatUsd(0.0123456)).toBe("$0.0123");
    expect(formatUsd(0.041)).toBe("$0.041");
  });

  it("clamps sub-0.0001 amounts and uses cents from $1", () => {
    expect(formatUsd(0.00001)).toBe("<$0.0001");
    expect(formatUsd(1.234)).toBe("$1.23");
    expect(formatUsd(0.9996)).toBe("$1.00");
  });
});

describe("formatTokenCount", () => {
  it("groups thousands", () => {
    expect(formatTokenCount(9119)).toBe("9,119");
    expect(formatTokenCount(42)).toBe("42");
  });
});
