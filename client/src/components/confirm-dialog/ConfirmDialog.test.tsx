import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog";

afterEach(cleanup);

const base: ConfirmDialogProps = {
  title: "Delete skill",
  body: '"x" will be permanently removed.',
  confirmLabel: "Delete",
  pendingLabel: "Deleting…",
  cancelLabel: "Cancel",
  onConfirm: () => {},
  onCancel: () => {},
};

function Harness(props: Partial<ConfirmDialogProps>) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <button>Behind</button>
      {open && <ConfirmDialog {...base} {...props} onCancel={() => setOpen(false)} />}
    </>
  );
}

describe("ConfirmDialog — focus", () => {
  it("focuses Cancel, traps Tab inside, and returns focus to the opener on close", () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);

    const cancel = screen.getByRole("button", { name: "Cancel" });
    const del = screen.getByRole("button", { name: "Delete" });
    const close = screen.getByRole("button", { name: "Close" });
    expect(cancel).toHaveFocus();

    // last control → Tab wraps to the first (the ✕), never to the page behind
    del.focus();
    fireEvent.keyDown(del, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(del).toHaveFocus();

    fireEvent.click(cancel);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("while pending, focus stays on the dialog (not <body>) and Tab can't leave it", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...base} pending onCancel={onCancel} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();
    expect(screen.getByRole("button", { name: /Deleting…/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
