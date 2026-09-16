import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

describe("RunCostBadge", () => {
  it("renders the formatted cost", () => {
    render(<RunCostBadge costUsd={0.0013} />);
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });

  it("renders — for null (no cost data)", () => {
    render(<RunCostBadge costUsd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
