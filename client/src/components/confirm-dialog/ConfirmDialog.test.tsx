import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
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

describe("ConfirmDialog — accessible name", () => {
  it("the dialog is named by its title and described by its body", () => {
    render(<ConfirmDialog {...base} />);
    const dialog = screen.getByRole("dialog", { name: "Delete skill" });
    expect(dialog).toHaveAccessibleDescription('"x" will be permanently removed.');
  });
});

describe("ConfirmDialog — focus", () => {
  it("focuses Cancel, traps Tab inside, and returns focus to the opener on close", async () => {
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
    await waitFor(() => expect(opener).toHaveFocus()); // restored after unmount (deferred)
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

  it("after a failed confirm, focus returns to Cancel and the error is announced", () => {
    const { rerender } = render(<ConfirmDialog {...base} pending />);
    expect(screen.getByRole("dialog")).toHaveFocus();
    rerender(<ConfirmDialog {...base} pending={false} error="Skill is in use" />);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("Skill is in use");
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled(); // retry is possible
  });

  it("in StrictMode (dev) opening keeps Cancel focused; closing still returns to the opener", async () => {
    render(
      <React.StrictMode>
        <Harness />
      </React.StrictMode>,
    );
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);
    // StrictMode's immediate cleanup + re-setup must not move focus to the opener
    await Promise.resolve();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
