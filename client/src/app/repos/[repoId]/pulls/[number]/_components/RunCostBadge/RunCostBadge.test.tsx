import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";

describe("RunCostBadge", () => {
  it("renders the formatted USD value for a positive cost", () => {
    render(<RunCostBadge cost={0.012} />);
    expect(screen.getByText("$0.012")).toBeInTheDocument();
  });

  it("renders a muted em-dash for null", () => {
    render(<RunCostBadge cost={null} />);
    const dash = screen.getByText("—");
    expect(dash).toBeInTheDocument();
    expect(dash).toHaveStyle("color: var(--muted)");
  });

  it("renders a muted em-dash for exactly 0", () => {
    render(<RunCostBadge cost={0} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
