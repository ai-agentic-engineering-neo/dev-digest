import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/common.json";
import { ConfirmDialog } from "./ConfirmDialog";

afterEach(cleanup);

function setup() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <>
      <button>Opener</button>
      <NextIntlClientProvider locale="en" messages={{ common: messages }}>
        <ConfirmDialog
          title="Delete thing"
          message="Really delete it?"
          confirmLabel="Delete"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </NextIntlClientProvider>
    </>,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("is a labelled dialog with focus on Cancel", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Delete thing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("calls onConfirm only when the confirm button is used", () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancel and Escape do not confirm", () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("keeps Tab focus inside the dialog", () => {
    setup();
    const dialog = screen.getByRole("dialog");
    const confirm = screen.getByRole("button", { name: "Delete" });
    confirm.focus();
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });
});
