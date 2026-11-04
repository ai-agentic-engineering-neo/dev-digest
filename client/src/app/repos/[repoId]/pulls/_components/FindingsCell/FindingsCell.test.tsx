import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { FindingsCell } from "./FindingsCell";
import { placePopover } from "./helpers";

afterEach(cleanup);

const LABELS = {
  heading: "Findings in this run",
  none: "Clean",
  more: (n: number) => `+${n} more on the PR page`,
  chip: (s: string, n: number) => `${n} ${s.toLowerCase()}`,
};

const FINDINGS = {
  critical: 1,
  warning: 0,
  suggestion: 3,
  top: [
    { severity: "CRITICAL" as const, title: "SQL built from user input", file: "src/db.ts", start_line: 42 },
    { severity: "SUGGESTION" as const, title: "Extract helper", file: "src/a.ts", start_line: 7 },
  ],
};

describe("FindingsCell", () => {
  it("shows a dash for a never-reviewed PR and 'Clean' for a run with no findings", () => {
    const { rerender } = render(<FindingsCell findings={null} labels={LABELS} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    rerender(<FindingsCell findings={{ critical: 0, warning: 0, suggestion: 0, top: [] }} labels={LABELS} />);
    expect(screen.getByText("Clean")).toBeInTheDocument();
  });

  it("shows only non-zero severity chips with counts", () => {
    render(<FindingsCell findings={FINDINGS} labels={LABELS} />);
    expect(screen.getByRole("img", { name: "1 critical" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "3 suggestion" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /warning/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("hover opens the 'Findings in this run' popover with short cards and a +N footer", () => {
    render(<FindingsCell findings={FINDINGS} labels={LABELS} />);
    fireEvent.mouseEnter(screen.getByTestId("findings-cell"));
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Findings in this run");
    expect(tip).toHaveTextContent("SQL built from user input");
    expect(tip).toHaveTextContent("src/db.ts:42");
    expect(tip).toHaveTextContent("+2 more on the PR page"); // 4 total − 2 cards
    fireEvent.mouseLeave(screen.getByTestId("findings-cell"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("is keyboard reachable: focus opens, Escape closes", () => {
    render(<FindingsCell findings={FINDINGS} labels={LABELS} />);
    const cell = screen.getByTestId("findings-cell");
    fireEvent.focus(cell);
    const tip = screen.getByRole("tooltip");
    expect(cell).toHaveAttribute("aria-describedby", tip.id);
    fireEvent.keyDown(cell, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("placePopover", () => {
  const vp = { width: 1200, height: 800 };
  it("opens below, right-aligned to the cell", () => {
    expect(placePopover({ top: 100, bottom: 130, right: 900 }, vp)).toEqual({ left: 560, top: 136 });
  });
  it("flips upward near the bottom edge and clamps inside the viewport", () => {
    expect(placePopover({ top: 700, bottom: 730, right: 200 }, vp)).toEqual({ left: 8, bottom: 106 });
  });
});
