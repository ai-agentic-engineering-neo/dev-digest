import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

import { Popover } from "./Popover";

// React's onMouseEnter/onMouseLeave are synthesized from native mouseover/
// mouseout (mouseenter/mouseleave themselves don't bubble, so React doesn't
// listen for them directly) — fireEvent.mouseOver/mouseOut is what actually
// reaches the handlers here, not fireEvent.mouseEnter/mouseLeave.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Popover", () => {
  it("opens on hover and closes after a grace delay once the mouse leaves", () => {
    vi.useFakeTimers();
    render(
      <Popover trigger={<span>hover me</span>} content={<span>the content</span>} />,
    );

    expect(screen.queryByText("the content")).not.toBeInTheDocument();

    fireEvent.mouseOver(screen.getByText("hover me"));
    expect(screen.getByText("the content")).toBeInTheDocument();

    fireEvent.mouseOut(screen.getByText("hover me"));
    // Still visible immediately after — the close is delayed, not instant.
    expect(screen.getByText("the content")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText("the content")).not.toBeInTheDocument();
  });

  it("stays open when the mouse moves from the trigger onto the panel", () => {
    vi.useFakeTimers();
    render(
      <Popover trigger={<span>hover me</span>} content={<span>the content</span>} />,
    );

    fireEvent.mouseOver(screen.getByText("hover me"));
    fireEvent.mouseOut(screen.getByText("hover me"));
    fireEvent.mouseOver(screen.getByText("the content"));

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("the content")).toBeInTheDocument();
  });
});
