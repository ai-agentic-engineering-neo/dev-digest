/**
 * RunCostBadge — cost/usage formatting rules from server/specs/01-run-cost-badge.md.
 * The key guard: a run with no data reads "—", never "$0.00".
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";
import { formatTokenCount, formatTokenPair, formatUsd } from "./helpers";

afterEach(cleanup);

describe("formatUsd", () => {
  it("unknown cost reads '—', never '$0.00'", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(undefined)).toBe("—");
    expect(formatUsd(Number.NaN)).toBe("—");
  });

  it("a zero-priced run is real data → '$0.00'", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("scales precision with the amount", () => {
    expect(formatUsd(1.234)).toBe("$1.23");
    expect(formatUsd(0.0134)).toBe("$0.013");
    expect(formatUsd(0.041)).toBe("$0.041");
    expect(formatUsd(0.00134)).toBe("$0.0013");
    expect(formatUsd(0.003)).toBe("$0.003");
    expect(formatUsd(0.000012)).toBe("$0.000012");
  });
});

describe("formatTokenCount / formatTokenPair", () => {
  it("compacts thousands and millions", () => {
    expect(formatTokenCount(950)).toBe("950");
    expect(formatTokenCount(8212)).toBe("8.2K");
    expect(formatTokenCount(12_000)).toBe("12K");
    expect(formatTokenCount(1_250_000)).toBe("1.3M");
    expect(formatTokenCount(999_960)).toBe("1M");
  });

  it("pairs in→out, and has nothing to show for a run without usage", () => {
    expect(formatTokenPair(8212, 1301)).toBe("8.2K→1.3K");
    expect(formatTokenPair(null, 1301)).toBeNull();
    expect(formatTokenPair(0, 0)).toBeNull();
  });
});

describe("RunCostBadge", () => {
  it("compact shows the cost only", () => {
    render(<RunCostBadge variant="compact" costUsd={0.0134} tokensIn={8212} tokensOut={1301} />);
    expect(screen.getByText("$0.013")).toBeInTheDocument();
  });

  it("detailed shows cost · in→out tokens", () => {
    render(<RunCostBadge variant="detailed" costUsd={0.0013} tokensIn={8212} tokensOut={1301} />);
    expect(screen.getByText("$0.0013 · 8.2K→1.3K")).toBeInTheDocument();
  });

  it("detailed keeps the tokens when the cost is unknown", () => {
    render(<RunCostBadge variant="detailed" costUsd={null} tokensIn={8212} tokensOut={1301} />);
    expect(screen.getByText("— · 8.2K→1.3K")).toBeInTheDocument();
  });

  it("no cost and no usage reads '—'", () => {
    render(<RunCostBadge variant="detailed" costUsd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
