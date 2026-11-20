import { describe, it, expect } from "vitest";
import { formatCost } from "./helpers";

describe("formatCost", () => {
  it("unknown cost is '—', never a fake $0", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("a real zero (free model) is $0", () => {
    expect(formatCost(0)).toBe("$0");
  });

  it("sub-dollar keeps 3 significant digits", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.012345)).toBe("$0.0123");
    expect(formatCost(0.06)).toBe("$0.06");
    expect(formatCost(0.0003)).toBe("$0.0003");
  });

  it("a dollar or more uses cents", () => {
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(12.345)).toBe("$12.35");
  });
});
