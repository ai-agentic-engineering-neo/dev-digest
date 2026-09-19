import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

describe("RunCostBadge", () => {
  it("compact: shows the price, and '—' rather than '$0.00' when the run is unpriced", () => {
    render(<RunCostBadge variant="compact" cost={0.014} />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();

    cleanup();
    render(<RunCostBadge variant="compact" cost={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });

  it("withTokens: shows total tokens with the price, and collapses to one '—' when nothing is known", () => {
    render(<RunCostBadge variant="withTokens" tokensIn={9000} tokensOut={119} cost={0.0013} />);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();

    cleanup();
    render(<RunCostBadge variant="withTokens" tokensIn={12000} tokensOut={11} cost={null} />);
    expect(screen.getByText("12,011 tok · —")).toBeInTheDocument();

    cleanup();
    render(<RunCostBadge variant="withTokens" tokensIn={0} tokensOut={0} cost={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
  });
});
