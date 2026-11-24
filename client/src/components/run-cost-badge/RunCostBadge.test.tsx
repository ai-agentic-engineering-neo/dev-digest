import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

describe("RunCostBadge", () => {
  it("compact: shows only the cost", () => {
    render(<RunCostBadge costUsd={0.014} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByTestId("run-cost").textContent).toBe("$0.014");
  });
  it("detailed: cost · tokens", () => {
    render(<RunCostBadge variant="detailed" costUsd={0.014} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByTestId("run-cost").textContent).toBe("$0.014 · 8.2K→1.3K");
  });
  it("no data → dash, not $0.00", () => {
    render(<RunCostBadge costUsd={null} />);
    expect(screen.getByTestId("run-cost").textContent).toBe("—");
  });
});
