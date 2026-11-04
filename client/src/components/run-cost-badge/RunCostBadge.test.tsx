import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";
import { formatCost, formatTokenTotal } from "./helpers";

afterEach(cleanup);

describe("formatCost", () => {
  it("shows an em dash for unknown cost, never $0.00", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(Number.NaN)).toBe("—");
  });
  it("uses 4 decimals below one cent", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
  });
  it("uses 3 decimals from one cent up", () => {
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.06)).toBe("$0.060");
  });
  it("shows a priced zero as $0.000", () => {
    expect(formatCost(0)).toBe("$0.000");
  });
});

describe("formatTokenTotal", () => {
  it("sums in+out with thousands separators", () => {
    expect(formatTokenTotal(8200, 919)).toBe("9,119");
  });
  it("is null when both are unknown", () => {
    expect(formatTokenTotal(null, null)).toBeNull();
  });
});

describe("RunCostBadge", () => {
  it("compact renders cost only", () => {
    render(<RunCostBadge variant="compact" costUsd={0.014} tokensIn={100} tokensOut={50} />);
    expect(screen.getByTestId("run-cost-badge").textContent).toBe("$0.014");
  });
  it("detailed renders tokens and cost", () => {
    render(<RunCostBadge variant="detailed" costUsd={0.0013} tokensIn={8200} tokensOut={919} tokenUnit="tok" />);
    expect(screen.getByTestId("run-cost-badge").textContent).toBe("9,119 tok · $0.0013");
  });
  it("detailed without cost data shows the dash", () => {
    render(<RunCostBadge variant="detailed" costUsd={null} tokensIn={0} tokensOut={0} />);
    expect(screen.getByTestId("run-cost-badge").textContent).toBe("0 tok · —");
  });
});
