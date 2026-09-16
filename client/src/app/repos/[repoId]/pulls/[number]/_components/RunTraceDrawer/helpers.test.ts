import { describe, it, expect } from "vitest";
import { formatCost } from "./helpers";

describe("formatCost", () => {
  it("renders '—' for unknown cost (null/undefined), never '$0.00'", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("renders exactly '$0.00' for a genuine zero cost", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("rounds small costs to 2 significant figures", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.0598)).toBe("$0.06");
  });

  it("shows 2 decimal places for costs of $1 or more", () => {
    expect(formatCost(3.2)).toBe("$3.20");
    expect(formatCost(12)).toBe("$12.00");
  });
});
