/**
 * RunCostBadge — both variants, and the "no fake price" rule: an unknown cost
 * renders `—` (compact) or nothing (detailed), never `$0.00`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge, formatTokenCount } from "./RunCostBadge";

afterEach(cleanup);

describe("RunCostBadge compact", () => {
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
    expect(badge.textContent).toBe("—");
    expect(badge.getAttribute("data-empty")).toBe("true");
  });
});

describe("RunCostBadge detailed", () => {
  it("shows cost and tokens in→out", () => {
    render(<RunCostBadge variant="detailed" costUsd={0.014} tokensIn={8240} tokensOut={1290} />);
    expect(screen.getByTestId("run-cost-badge").textContent).toBe("$0.014 · 8.2K→1.3K");
  });

  it("shows only the cost when tokens are unknown", () => {
    render(<RunCostBadge variant="detailed" costUsd={0.014} />);
    expect(screen.getByTestId("run-cost-badge").textContent).toBe("$0.014");
  });

  it("renders nothing when the cost is unknown", () => {
    const { container } = render(<RunCostBadge variant="detailed" costUsd={null} tokensIn={10} tokensOut={2} />);
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
