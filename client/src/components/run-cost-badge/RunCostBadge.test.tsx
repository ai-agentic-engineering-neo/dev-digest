/**
 * RunCostBadge — the four design variants, and the "no fake price" rule: an
 * unknown cost renders `–` (PR list cell) or nothing, never `$0.00`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge, formatTokenCount } from "./RunCostBadge";

afterEach(cleanup);

describe("RunCostBadge cell (PR list)", () => {
  it("shows the cost with at least two significant digits", () => {
    render(<RunCostBadge costUsd={0.0123} ariaLabel={(c) => `cost ${c}`} />);
    const badge = screen.getByTestId("run-cost-badge");
    expect(badge.textContent).toBe("$0.012");
    expect(badge.getAttribute("aria-label")).toBe("cost $0.012");
  });

  it("shows a sub-cent cost without collapsing to $0.00", () => {
    render(<RunCostBadge costUsd={0.0017} />);
    expect(screen.getByTestId("run-cost-badge").textContent).toBe("$0.0017");
  });

  it("shows a dash when the cost is unknown", () => {
    render(<RunCostBadge costUsd={null} />);
    const badge = screen.getByTestId("run-cost-badge");
    expect(badge.textContent).toBe("–");
    expect(badge.getAttribute("data-empty")).toBe("true");
  });
});

describe("RunCostBadge other variants", () => {
  it("cost: the amount alone, even when tokens are known", () => {
    render(<RunCostBadge variant="cost" costUsd={0.0013} tokensIn={9000} tokensOut={119} />);
    expect(screen.getByTestId("run-cost-badge").textContent).toBe("$0.0013");
  });

  it("usage: cost and tokens in→out", () => {
    render(<RunCostBadge variant="usage" costUsd={0.014} tokensIn={8240} tokensOut={1290} />);
    expect(screen.getByTestId("run-cost-badge").textContent).toBe("$0.0148.2K→1.3K");
  });

  it("tokTotal: total tokens with separators, then cost", () => {
    render(<RunCostBadge variant="tokTotal" costUsd={0.0013} tokensIn={8000} tokensOut={1119} />);
    expect(screen.getByTestId("run-cost-badge").textContent).toBe("9,119 tok · $0.0013");
  });

  it.each(["cost", "usage", "tokTotal"] as const)("%s renders nothing when the cost is unknown", (variant) => {
    const { container } = render(<RunCostBadge variant={variant} costUsd={null} tokensIn={10} tokensOut={2} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("formatTokenCount", () => {
  it("is compact", () => {
    expect(formatTokenCount(950)).toBe("950");
    expect(formatTokenCount(16181)).toBe("16.2K");
    expect(formatTokenCount(1214)).toBe("1.2K");
    expect(formatTokenCount(250000)).toBe("250K");
  });
});
