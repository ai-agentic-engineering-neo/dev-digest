/**
 * RunCostBadge — readable cost with ≥3 significant digits, and "—" (never
 * "$0.00") when a run has no cost data.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";
import { formatCost, formatTokenCount } from "./helpers";

afterEach(cleanup);

describe("formatCost", () => {
  it("keeps 3 decimals at ≥ $0.01 and 2 significant digits below", () => {
    expect(formatCost(0.0142)).toBe("$0.014");
    expect(formatCost(0.012)).toBe("$0.012"); // not "$0.01"
    expect(formatCost(1.25)).toBe("$1.250");
    expect(formatCost(0.00134)).toBe("$0.0013");
    expect(formatCost(0.00999)).toBe("$0.010");
  });

  it("no data → '—', a real free run → '$0.000'", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(0)).toBe("$0.000");
  });
});

describe("formatTokenCount", () => {
  it("compacts thousands and millions", () => {
    expect(formatTokenCount(800)).toBe("800");
    expect(formatTokenCount(8200)).toBe("8.2K");
    expect(formatTokenCount(15000)).toBe("15K");
    expect(formatTokenCount(1_250_000)).toBe("1.3M");
  });
});

describe("RunCostBadge", () => {
  it("compact shows only the cost", () => {
    render(<RunCostBadge costUsd={0.012} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByTestId("run-cost-badge")).toHaveTextContent(/^\$0\.012$/);
  });

  it("detailed shows cost · tokens in→out", () => {
    render(<RunCostBadge variant="detailed" costUsd={0.0142} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByText("$0.014 · 8.2K→1.3K")).toBeInTheDocument();
  });

  it("a run without cost data renders '—', not '$0.00'", () => {
    render(<RunCostBadge costUsd={null} />);
    expect(screen.getByTestId("run-cost-badge")).toHaveTextContent(/^—$/);
  });
});
