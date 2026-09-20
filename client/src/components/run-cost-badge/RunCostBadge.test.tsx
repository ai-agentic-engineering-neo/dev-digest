import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";

describe("RunCostBadge", () => {
  it("compact variant shows a dash for missing cost data", () => {
    render(<RunCostBadge variant="compact" costUsd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("compact variant shows the formatted cost, no token text", () => {
    render(<RunCostBadge variant="compact" costUsd={0.012} />);
    expect(screen.getByText("$0.012")).toBeInTheDocument();
  });

  it("detailed variant shows cost + token delta", () => {
    render(<RunCostBadge variant="detailed" costUsd={0.0013} tokensIn={9119} tokensOut={1200} />);
    expect(screen.getByText("$0.0013 · 9k→1.2k")).toBeInTheDocument();
  });

  it("detailed variant omits the token segment when tokens are missing (e.g. failed run)", () => {
    render(<RunCostBadge variant="detailed" costUsd={null} tokensIn={null} tokensOut={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
