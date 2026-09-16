import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

describe("RunCostBadge", () => {
  it("compact variant renders the formatted cost", () => {
    render(<RunCostBadge usd={0.014} />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("compact variant renders — for a run with no usage data", () => {
    render(<RunCostBadge usd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("withTokens variant bundles the token count and cost", () => {
    render(<RunCostBadge variant="withTokens" usd={0.0013} tokensIn={8119} tokensOut={1000} />);
    expect(screen.getByText(/9,119 tok/)).toBeInTheDocument();
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });

  it("withTokens variant shows — (not $0.00) when cost is missing", () => {
    render(<RunCostBadge variant="withTokens" usd={null} tokensIn={100} tokensOut={50} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
