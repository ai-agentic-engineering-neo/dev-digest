import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SeverityFilterChip } from "./SeverityFilterChip";

afterEach(cleanup);

describe("SeverityFilterChip", () => {
  it("renders the severity label and count", () => {
    render(<SeverityFilterChip severity="CRITICAL" count={3} active={false} onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: /critical/i })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("calls onClick when pressed", () => {
    const onClick = vi.fn();
    render(<SeverityFilterChip severity="WARNING" count={1} active={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("marks itself pressed when active", () => {
    render(<SeverityFilterChip severity="SUGGESTION" count={2} active onClick={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("is not pressed when inactive", () => {
    render(<SeverityFilterChip severity="SUGGESTION" count={2} active={false} onClick={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });
});
