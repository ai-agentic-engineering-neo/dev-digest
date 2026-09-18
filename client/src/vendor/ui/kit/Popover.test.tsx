/**
 * Popover — the behaviours the findings surfaces depend on:
 * portal rendering (so an `overflow: hidden` ancestor can't clip it), lazy
 * children, Escape/outside-click dismissal, and — critically — not leaking
 * clicks to an ancestor's onClick through the React portal tree.
 *
 * Dismissal is driven by `mousedown` (not `click`), so the outside-click cases
 * below fire `mouseDown` deliberately; a `click` would not close it.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Popover } from "./Popover";

afterEach(cleanup);

const open = () => fireEvent.click(screen.getByRole("button", { name: "Show findings" }));

describe("Popover", () => {
  it("renders nothing until opened, then shows the panel", () => {
    render(
      <Popover label="Show findings" trigger={<span>2</span>}>
        <p>panel body</p>
      </Popover>,
    );
    expect(screen.queryByText("panel body")).not.toBeInTheDocument();

    open();
    expect(screen.getByRole("dialog", { name: "Show findings" })).toBeInTheDocument();
    expect(screen.getByText("panel body")).toBeInTheDocument();
  });

  it("escapes a clipping ancestor by portaling out of it", () => {
    const { container } = render(
      <div style={{ overflow: "hidden" }}>
        <Popover label="Show findings" trigger={<span>2</span>}>
          <p>panel body</p>
        </Popover>
      </div>,
    );
    open();
    // In the document, but NOT inside the clipping wrapper.
    expect(screen.getByText("panel body")).toBeInTheDocument();
    expect(container.querySelector("[role=dialog]")).toBeNull();
  });

  it("does not leak clicks to an ancestor onClick — trigger or panel", () => {
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <Popover label="Show findings" trigger={<span>2</span>}>
          <p>panel body</p>
        </Popover>
      </div>,
    );
    open();
    expect(onRowClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("panel body"));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    render(
      <Popover label="Show findings" trigger={<span>2</span>}>
        <p>panel body</p>
      </Popover>,
    );
    open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("panel body")).not.toBeInTheDocument();
  });

  it("closes on an outside click but not on a click inside the panel", () => {
    render(
      <div>
        <Popover label="Show findings" trigger={<span>2</span>}>
          <p>panel body</p>
        </Popover>
        <button type="button">elsewhere</button>
      </div>,
    );
    open();

    fireEvent.mouseDown(screen.getByText("panel body"));
    expect(screen.getByText("panel body")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText("elsewhere"));
    expect(screen.queryByText("panel body")).not.toBeInTheDocument();
  });

  it("reports open/close so a caller can defer a fetch", () => {
    const onOpenChange = vi.fn();
    render(
      <Popover label="Show findings" trigger={<span>2</span>} onOpenChange={onOpenChange}>
        <p>panel body</p>
      </Popover>,
    );
    expect(onOpenChange).not.toHaveBeenCalled();

    open();
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("exposes expanded state on the trigger", () => {
    render(
      <Popover label="Show findings" trigger={<span>2</span>}>
        <p>panel body</p>
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: "Show findings" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    open();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
