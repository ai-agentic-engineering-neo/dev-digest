import { describe, it, expect } from "vitest";
import { formatCost } from "./format-cost";

describe("formatCost", () => {
  it("uses 4 decimals under a cent", () => expect(formatCost(0.0013)).toBe("$0.0013"));
  it("uses 3 decimals under a dollar", () => {
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.06)).toBe("$0.060");
  });
  it("uses 2 decimals from a dollar up", () => expect(formatCost(1.254)).toBe("$1.25"));
  it("renders a true zero as $0.0000", () => expect(formatCost(0)).toBe("$0.0000"));
  it("renders unknown cost as an em dash", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(NaN)).toBe("—");
  });
});
