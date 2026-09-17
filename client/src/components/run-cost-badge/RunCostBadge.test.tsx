import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

describe("RunCostBadge", () => {
  it("compact: renders cost only", () => {
    render(<RunCostBadge variant="compact" costUsd={0.014} />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("compact: renders the em dash when cost is null (never reviewed / unpriced / failed)", () => {
    render(<RunCostBadge variant="compact" costUsd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("full: renders cost + tokens", () => {
    render(<RunCostBadge variant="full" costUsd={0.014} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByText("$0.014 · 8.2K→1.3K")).toBeInTheDocument();
  });

  it("full: collapses to a single dash (not '– · –') when cost is null", () => {
    render(<RunCostBadge variant="full" costUsd={null} tokensIn={null} tokensOut={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows '<$0.001' instead of rounding a tiny nonzero cost to '$0.000'", () => {
    render(<RunCostBadge variant="compact" costUsd={0.0001} />);
    expect(screen.getByText("<$0.001")).toBeInTheDocument();
  });
});
