import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

describe("RunCostBadge", () => {
  it("compact shows the cost only", () => {
    render(<RunCostBadge variant="compact" costUsd={0.012} tokensIn={8190} tokensOut={929} />);
    expect(screen.getByText("$0.012")).toBeInTheDocument();
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
  });

  it("full shows total tokens and cost", () => {
    render(<RunCostBadge variant="full" costUsd={0.0013} tokensIn={8190} tokensOut={929} />);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("full without tokens falls back to the cost alone", () => {
    render(<RunCostBadge variant="full" costUsd={0.06} />);
    expect(screen.getByText("$0.06")).toBeInTheDocument();
  });

  it("no cost renders an em dash even when tokens are known", () => {
    render(<RunCostBadge variant="full" costUsd={null} tokensIn={100} tokensOut={50} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
  });

  it("zero is a real (free) price, not missing data", () => {
    render(<RunCostBadge variant="compact" costUsd={0} />);
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });

  it("passes the tooltip through", () => {
    render(<RunCostBadge variant="compact" costUsd={0.5} title="3 runs" />);
    expect(screen.getByTitle("3 runs")).toHaveTextContent("$0.50");
  });
});
