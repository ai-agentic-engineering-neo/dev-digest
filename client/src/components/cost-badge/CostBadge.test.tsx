import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CostBadge } from "./CostBadge";

afterEach(cleanup);

describe("CostBadge", () => {
  it("shows an em-dash (no tooltip) when cost is unknown", () => {
    render(<CostBadge usd={null} title="Cost of this review" />);
    const el = screen.getByText("—");
    expect(el).toBeInTheDocument();
    expect(el).not.toHaveAttribute("title");
  });

  it("treats undefined like null (older payloads without the field)", () => {
    render(<CostBadge usd={undefined} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("formats a known cost and exposes the tooltip", () => {
    render(<CostBadge usd={0.014} title="Cost of this review" />);
    const el = screen.getByText("$0.014");
    expect(el).toHaveAttribute("title", "Cost of this review");
  });

  it("uses 2 decimals from $1 up", () => {
    render(<CostBadge usd={1.25} />);
    expect(screen.getByText("$1.25")).toBeInTheDocument();
  });
});
