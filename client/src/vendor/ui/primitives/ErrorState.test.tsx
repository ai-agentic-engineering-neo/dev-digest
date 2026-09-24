import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ErrorState } from "./ErrorState";

afterEach(cleanup);

describe("ErrorState retry button", () => {
  it("uses the given retryLabel", () => {
    const onRetry = vi.fn();
    render(<ErrorState body="x" onRetry={onRetry} retryLabel="Erneut versuchen" />);
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('defaults to "Retry"', () => {
    render(<ErrorState body="x" onRetry={() => {}} />);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
