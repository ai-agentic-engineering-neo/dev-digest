import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Modal } from "./Modal";
import { Drawer } from "./Drawer";

afterEach(cleanup);

const esc = () => fireEvent.keyDown(document, { key: "Escape" });
const tab = (shiftKey = false) => fireEvent.keyDown(document, { key: "Tab", shiftKey });

describe.each([
  ["Modal", Modal],
  ["Drawer", Drawer],
])("%s accessibility", (_name, Dialog) => {
  it("is labelled by its title", () => {
    render(<Dialog title="Create agent" onClose={() => {}}>body</Dialog>);
    expect(screen.getByRole("dialog", { name: "Create agent" })).toBeTruthy();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Dialog title="t" onClose={onClose}>body</Dialog>);
    esc();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the dialog and restores it to the trigger on unmount", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(<Dialog title="t" onClose={() => {}}>body</Dialog>);
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("traps Tab / Shift+Tab inside the dialog", () => {
    render(
      <Dialog title="t" onClose={() => {}}>
        <button>first</button>
        <button>last</button>
      </Dialog>,
    );
    const close = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "last" });

    last.focus();
    tab(); // forward from the last focusable wraps to the first (the Close button)
    expect(document.activeElement).toBe(close);

    tab(true); // backward from the first wraps to the last
    expect(document.activeElement).toBe(last);
  });
});

describe("stacked dialogs", () => {
  it("Escape closes only the topmost dialog", () => {
    const closeDrawer = vi.fn();
    const closeModal = vi.fn();
    render(
      <>
        <Drawer title="drawer" onClose={closeDrawer}>d</Drawer>
        <Modal title="modal" onClose={closeModal}>m</Modal>
      </>,
    );
    esc();
    expect(closeModal).toHaveBeenCalledTimes(1);
    expect(closeDrawer).not.toHaveBeenCalled();
  });
});
