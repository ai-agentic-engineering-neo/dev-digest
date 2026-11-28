/**
 * RunCostBadge — readable cost with ≥3 significant digits, and "—" (never
 * "$0.00") when a run has no cost data.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

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
