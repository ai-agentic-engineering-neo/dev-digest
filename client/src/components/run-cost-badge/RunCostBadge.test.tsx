import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RunCostBadge, formatCost } from "./RunCostBadge";

describe("formatCost", () => {
  it("formats by magnitude; missing data is a dash, real zero is data", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(0)).toBe("$0.0000");
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(1.5)).toBe("$1.50");
  });
});

describe("RunCostBadge", () => {
  it("compact: cost only", () => {
    render(<RunCostBadge cost={0.012} />);
    expect(screen.getByText("$0.012")).toBeTruthy();
  });

  it("full: tokens + cost", () => {
    render(<RunCostBadge cost={0.0013} tokensIn={8000} tokensOut={1119} />);
    expect(screen.getByText(/tok · \$0\.0013/)).toBeTruthy();
  });
});
