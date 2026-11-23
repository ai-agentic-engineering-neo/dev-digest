import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { buttonLikeProps, disclosureProps } from "./a11y";

afterEach(cleanup);

describe("buttonLikeProps", () => {
  it("returns nothing without a handler (element stays non-interactive)", () => {
    expect(buttonLikeProps(undefined)).toEqual({});
  });

  it("is focusable, announced as a button, and fires on click, Enter and Space", () => {
    const fn = vi.fn();
    render(<div {...buttonLikeProps(fn)}>head</div>);
    const el = screen.getByRole("button", { name: "head" });
    expect(el.tabIndex).toBe(0);
    fireEvent.click(el);
    fireEvent.keyDown(el, { key: "Enter" });
    fireEvent.keyDown(el, { key: " " });
    fireEvent.keyDown(el, { key: "a" });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("ignores key events that bubble from a nested control", () => {
    const fn = vi.fn();
    render(
      <div {...buttonLikeProps(fn)}>
        <button>inner</button>
      </div>,
    );
    fireEvent.keyDown(screen.getByText("inner"), { key: "Enter" });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("disclosureProps", () => {
  it("exposes aria-expanded", () => {
    render(<div {...disclosureProps(true, () => {})}>section</div>);
    expect(screen.getByRole("button", { name: "section" }).getAttribute("aria-expanded")).toBe("true");
  });
});
