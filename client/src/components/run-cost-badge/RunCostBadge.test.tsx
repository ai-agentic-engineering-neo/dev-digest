import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";

describe("RunCostBadge", () => {
  it("compact shows cost only, exact value in the tooltip", () => {
    render(<RunCostBadge costUsd={0.012} tokensIn={8200} tokensOut={1300} />);
    const el = screen.getByTestId("run-cost-badge");
    expect(el.textContent).toBe("$0.012");
    expect(el.getAttribute("title")).toBe("$0.012");
  });

  it("full shows cost and tokens", () => {
    render(<RunCostBadge variant="full" costUsd={0.014} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByTestId("run-cost-badge").textContent).toBe("$0.014 · 8.2K→1.3K");
  });

  it("no data renders an em dash, not $0.00", () => {
    render(<RunCostBadge variant="full" costUsd={null} />);
    const el = screen.getByTestId("run-cost-badge");
    expect(el.textContent).toBe("—");
    expect(el.getAttribute("title")).toBeNull();
  });
});
