import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge, formatRunCost } from "./RunCostBadge";

afterEach(cleanup);

describe("RunCostBadge", () => {
  it("compact: renders the cost alone", () => {
    render(<RunCostBadge costUsd={0.012} />);
    expect(screen.getByText("$0.012")).toBeInTheDocument();
  });

  it("compact: a run without data renders — (never $0.00)", () => {
    render(<RunCostBadge costUsd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("compact ignores tokens even when provided", () => {
    render(<RunCostBadge costUsd={0.0013} tokensIn={9119} tokensOut={500} />);
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });

  it("timeline: renders total tokens first, then cost", () => {
    render(<RunCostBadge variant="timeline" costUsd={0.0013} tokensIn={9000} tokensOut={119} />);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("timeline: tokens without cost render alone", () => {
    render(<RunCostBadge variant="timeline" costUsd={null} tokensIn={12000} tokensOut={11} />);
    expect(screen.getByText("12,011 tok")).toBeInTheDocument();
  });

  it("timeline: zero tokens and no cost render —", () => {
    render(<RunCostBadge variant="timeline" costUsd={null} tokensIn={0} tokensOut={0} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("formatRunCost", () => {
  it.each([
    [0.0013, "$0.0013"],
    [0.014, "$0.014"],
    [0.06, "$0.06"],
    [0, "$0.00"],
    [1.5, "$1.50"],
    [0.00001, "<$0.0001"],
  ])("%d → %s", (input, expected) => {
    expect(formatRunCost(input)).toBe(expected);
  });
});
