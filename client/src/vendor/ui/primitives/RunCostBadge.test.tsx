/**
 * RunCostBadge — the one rule that matters: missing data reads "—", never
 * "$0.00". A review run costs a tenth of a cent, so the sub-$1 branch carries
 * an extra decimal.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge, formatUsd, formatTokenFlow } from "./RunCostBadge";

afterEach(cleanup);

describe("RunCostBadge", () => {
  it("compact: renders the cost alone, 3 decimals below $1", () => {
    render(<RunCostBadge usd={0.014} />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("detailed: renders the cost next to the token flow", () => {
    render(<RunCostBadge usd={0.014} tokens={formatTokenFlow(8200, 1300)} />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
    expect(screen.getByText("8.2K→1.3K")).toBeInTheDocument();
  });

  it("an unpriced run reads '—', not '$0.00'", () => {
    render(<RunCostBadge usd={null} tokens="8.2K→1.3K" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    // the token flow goes with it — a lone token count is not this component's job
    expect(screen.queryByText("8.2K→1.3K")).not.toBeInTheDocument();
  });

  it("drops to 2 decimals from $1 up", () => {
    render(<RunCostBadge usd={1.25} />);
    expect(screen.getByText("$1.25")).toBeInTheDocument();
  });
});

describe("formatUsd", () => {
  it("keeps sub-cent runs legible", () => {
    expect(formatUsd(0.0013)).toBe("$0.001");
    expect(formatUsd(0.014)).toBe("$0.014");
    expect(formatUsd(0)).toBe("$0.000");
    expect(formatUsd(1)).toBe("$1.00");
    expect(formatUsd(12.5)).toBe("$12.50");
  });
});

describe("formatTokenFlow", () => {
  it("formats thousands with one decimal and a K suffix", () => {
    expect(formatTokenFlow(8200, 1300)).toBe("8.2K→1.3K");
  });

  it("leaves counts under 1000 raw", () => {
    expect(formatTokenFlow(840, 120)).toBe("840→120");
  });

  it("returns null when either side is unknown", () => {
    expect(formatTokenFlow(null, 1300)).toBeNull();
    expect(formatTokenFlow(8200, null)).toBeNull();
  });
});
