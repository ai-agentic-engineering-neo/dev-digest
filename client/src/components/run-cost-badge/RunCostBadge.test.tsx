import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

describe("RunCostBadge", () => {
  it("compact: shows only the cost", () => {
    render(<RunCostBadge costUsd={0.0137} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
    expect(screen.queryByText(/8.2K/)).not.toBeInTheDocument();
  });

  it("full: shows cost and token in→out", () => {
    render(<RunCostBadge variant="full" costUsd={0.0137} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByText("$0.014 · 8.2K→1.3K")).toBeInTheDocument();
  });

  it("unknown cost renders a dash, not $0.00", () => {
    render(<RunCostBadge costUsd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });
});
