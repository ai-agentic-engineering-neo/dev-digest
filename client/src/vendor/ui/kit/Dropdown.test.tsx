/**
 * Dropdown — `portal` renders the menu into `document.body` so an
 * `overflow: hidden` ancestor (the PR list's table card) can't clip it.
 *
 * The regression this file guards: the outside-click handler used to close on
 * ANY mousedown outside the trigger ref. Once the menu is portaled it is no
 * longer a descendant of that ref, so mousedown on a menu item closed the menu
 * before the item's own click fired — the item never ran. The fix is a second
 * `menuRef` checked alongside the trigger.
 *
 * NOTE: a body portal is NOT inside a test's scoped `<div data-theme=…>`
 * wrapper, so these tests assert structure and behaviour only, never computed
 * colours.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Dropdown } from "./Dropdown";
import type { DropdownItemDef } from "./types";

afterEach(cleanup);

function items(onPick: () => void): DropdownItemDef[] {
  return [
    { label: "Run all", icon: "Play", onClick: onPick },
    { divider: true },
    { label: "Configure", icon: "Settings" },
  ];
}

function open(portal: boolean, onPick = vi.fn()) {
  const utils = render(
    <Dropdown portal={portal} items={items(onPick)} trigger={<button>Open</button>} />,
  );
  fireEvent.click(screen.getByText("Open"));
  return { ...utils, onPick };
}

describe("Dropdown — portal placement", () => {
  it("renders the menu into document.body, outside the component subtree", () => {
    const { container } = open(true);
    const menu = document.body.querySelector("[data-testid='dropdown-menu']")!;
    expect(menu).toBeInTheDocument();
    expect(container.contains(menu)).toBe(false);
    // Positioned from the trigger's viewport rect, not an offset parent.
    expect(menu).toHaveStyle({ position: "fixed" });
  });

  it("without `portal` the menu stays in place, absolutely positioned (PrDetailHeader)", () => {
    const { container } = open(false);
    const menu = container.querySelector("[data-testid='dropdown-menu']")!;
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveStyle({ position: "absolute" });
  });
});

describe("Dropdown — no ARIA menu roles (none of the keyboard contract exists)", () => {
  it("uses plain button semantics, so nothing announces a menu it can't behave like", () => {
    open(true);
    expect(document.body.querySelector("[role='menu']")).toBeNull();
    expect(document.body.querySelector("[role='menuitem']")).toBeNull();
    // The items are still natively focusable/clickable buttons.
    expect(screen.getByText("Run all").closest("button")).toBeInTheDocument();
  });
});

describe("Dropdown — a portaled menu closes instead of detaching from its trigger", () => {
  it("closes on a scroll in ANY ancestor (the menu is fixed at a rect measured once)", () => {
    open(true);
    expect(screen.getByText("Run all")).toBeInTheDocument();
    // Capture-phase listener: a scroll on an inner container still reaches it.
    fireEvent.scroll(document);
    expect(screen.queryByText("Run all")).not.toBeInTheDocument();
  });

  it("closes on resize too", () => {
    open(true);
    fireEvent(window, new Event("resize"));
    expect(screen.queryByText("Run all")).not.toBeInTheDocument();
  });
});

describe("Dropdown — click-outside checks BOTH refs", () => {
  it("a mousedown INSIDE the portaled menu does not close it, so the item's click still fires", () => {
    const { onPick } = open(true);
    const item = screen.getByText("Run all");
    // The real browser order: mousedown lands first, then click.
    fireEvent.mouseDown(item);
    expect(screen.getByText("Run all")).toBeInTheDocument(); // still open
    fireEvent.click(item);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("a mousedown outside both the trigger and the portaled menu closes it", () => {
    open(true);
    expect(screen.getByText("Run all")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Run all")).not.toBeInTheDocument();
  });

  it("the same dual-ref check is harmless in the non-portaled case", () => {
    const { onPick } = open(false);
    const item = screen.getByText("Run all");
    fireEvent.mouseDown(item);
    fireEvent.click(item);
    expect(onPick).toHaveBeenCalledTimes(1);
    // Picking an item closes the menu.
    expect(screen.queryByText("Run all")).not.toBeInTheDocument();
  });

  it("clicking the trigger again toggles the menu shut", () => {
    open(true);
    fireEvent.click(screen.getByText("Open"));
    expect(screen.queryByText("Run all")).not.toBeInTheDocument();
  });
});
