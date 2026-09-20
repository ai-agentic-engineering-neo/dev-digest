/**
 * RunCostBadge — the money is only as trustworthy as its edge cases.
 * The rule the whole feature hangs on: an UNKNOWN cost (null) reads "—", while
 * a genuinely free model (0) reads "$0.00". Collapsing the two would quietly
 * report free reviews as costing nothing when we simply don't know the price.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge, formatRunCost } from "./RunCostBadge";

afterEach(cleanup);

describe("formatRunCost", () => {
  it("keeps 2 significant digits under $1, so sub-cent runs stay readable", () => {
    expect(formatRunCost(0.0013)).toBe("$0.0013");
    expect(formatRunCost(0.014)).toBe("$0.014");
    expect(formatRunCost(0.06)).toBe("$0.06");
  });

  it("switches to 2 decimal places at $1 and above", () => {
    expect(formatRunCost(1)).toBe("$1.00");
    expect(formatRunCost(12.5)).toBe("$12.50");
  });

  it("renders a real zero as $0.00 (free model), not '—'", () => {
    expect(formatRunCost(0)).toBe("$0.00");
  });

  it("floors at <$0.0001 instead of rounding a non-zero spend to zero", () => {
    expect(formatRunCost(0.00005)).toBe("<$0.0001");
  });
});

describe("RunCostBadge", () => {
  it("compact shows the cost alone", () => {
    render(<RunCostBadge costUsd={0.014} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("timeline shows total tokens then cost", () => {
    render(<RunCostBadge variant="timeline" costUsd={0.0013} tokensIn={9000} tokensOut={119} />);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("a null cost renders '—' in both variants", () => {
    const { rerender } = render(<RunCostBadge costUsd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    rerender(<RunCostBadge variant="timeline" costUsd={undefined} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("timeline with a known cost but no tokens still shows the cost", () => {
    render(<RunCostBadge variant="timeline" costUsd={0.002} />);
    expect(screen.getByText("$0.002")).toBeInTheDocument();
  });
});
