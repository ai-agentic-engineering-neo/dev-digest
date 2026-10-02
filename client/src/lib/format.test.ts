import { describe, it, expect } from "vitest";
import { formatCost, formatTokens } from "./format";

describe("formatCost", () => {
  it("renders an em dash for unknown cost, not a fake price", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("keeps a genuine zero distinguishable from unknown", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("keeps enough precision on small run costs", () => {
    expect(formatCost(0.012)).toBe("$0.012");
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.0013)).toBe("$0.0013");
  });

  it("keeps 3 significant digits on sub-cent runs instead of collapsing to $0.00", () => {
    expect(formatCost(0.00039347)).toBe("$0.000393");
    expect(formatCost(0.000613613)).toBe("$0.000614");
  });

  it("pads short sub-dollar values to a currency-looking 2 decimals", () => {
    expect(formatCost(0.1)).toBe("$0.10");
    expect(formatCost(0.5)).toBe("$0.50");
  });

  it("stays currency-shaped at and above a dollar", () => {
    expect(formatCost(1.234)).toBe("$1.23");
    expect(formatCost(12)).toBe("$12.00");
  });
});

describe("formatTokens", () => {
  it("renders in→out in thousands", () => {
    expect(formatTokens(8200, 1300)).toBe("8.2K→1.3K");
  });
});
