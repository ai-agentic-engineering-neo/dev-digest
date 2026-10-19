import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

describe("RunCostBadge", () => {
  it("compact: shows the cost, or a dash when unknown", () => {
    const { rerender } = render(<RunCostBadge variant="compact" costUsd={0.01412} />);
    expect(screen.getByText("$0.014")).toBeTruthy();
    rerender(<RunCostBadge variant="compact" costUsd={null} />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText(/\$0\.00/)).toBeNull();
  });

  it("detailed: total tokens · cost", () => {
    render(<RunCostBadge variant="detailed" tokensIn={8000} tokensOut={1119} costUsd={0.0013} />);
    expect(screen.getByText("9 119 tok · $0.0013")).toBeTruthy();
  });

  it("detailed: tokens only when cost is unknown", () => {
    render(<RunCostBadge variant="detailed" tokensIn={100} tokensOut={50} costUsd={null} />);
    expect(screen.getByText("150 tok")).toBeTruthy();
  });

  it("detailed: renders nothing for a run without usage (failed run)", () => {
    const { container } = render(
      <RunCostBadge variant="detailed" tokensIn={0} tokensOut={0} costUsd={null} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
