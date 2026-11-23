import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";
import { formatCost, formatTokenTotal } from "./helpers";

describe("formatCost", () => {
  it("shows 2 significant digits below $1, matching the design values", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.003)).toBe("$0.003");
    expect(formatCost(0.06)).toBe("$0.06");
    expect(formatCost(0.00143332)).toBe("$0.0014");
  });

  it("uses 2 decimals from $1", () => {
    expect(formatCost(1.2449)).toBe("$1.24");
  });

  it("renders missing data as — and never as $0.00", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(Number.NaN)).toBe("—");
  });
});

describe("formatTokenTotal", () => {
  it("sums in + out with a thousands separator", () => {
    expect(formatTokenTotal(8000, 1119)).toBe("9,119");
  });
  it("is null when there are no tokens", () => {
    expect(formatTokenTotal(0, 0)).toBeNull();
    expect(formatTokenTotal(null, undefined)).toBeNull();
  });
});

describe("RunCostBadge", () => {
  it("compact: cost only", () => {
    render(<RunCostBadge variant="compact" usd={0.014} />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("detailed: tokens label · cost", () => {
    render(<RunCostBadge variant="detailed" usd={0.0013} tokensLabel="9,119 tok" />);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("shows — when the cost is unknown", () => {
    render(<RunCostBadge variant="compact" usd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
