import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

describe("RunCostBadge", () => {
  it("compact: cost only, exact value in the tooltip", () => {
    render(<RunCostBadge costUsd={0.014} tokensIn={8200} tokensOut={1300} />);
    const el = screen.getByTestId("run-cost");
    expect(el).toHaveTextContent(/^\$0\.014$/);
    expect(el).toHaveAttribute("title", "$0.014000");
  });

  it("detailed: cost · tokens", () => {
    render(<RunCostBadge variant="detailed" costUsd={0.014} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByTestId("run-cost")).toHaveTextContent("$0.014 · 8k→1.3k");
  });

  it("unknown cost renders — (never $0.00) and has no tooltip", () => {
    render(<RunCostBadge costUsd={null} />);
    const el = screen.getByTestId("run-cost");
    expect(el).toHaveTextContent(/^—$/);
    expect(el).not.toHaveAttribute("title");
  });

  it("a real zero (free model) renders $0.00", () => {
    render(<RunCostBadge costUsd={0} />);
    expect(screen.getByTestId("run-cost")).toHaveTextContent("$0.00");
  });

  it("detailed with unknown cost still shows known tokens", () => {
    render(<RunCostBadge variant="detailed" costUsd={null} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByTestId("run-cost")).toHaveTextContent("— · 8k→1.3k");
  });
});
