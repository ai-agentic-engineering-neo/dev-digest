import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import React from "react";
import { ApiError } from "@/lib/api";
import { ConfirmDialog } from "./ConfirmDialog";

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const merged = {
    title: "Delete this skill?",
    body: 'Delete skill "repo-conventions"?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...props,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <ConfirmDialog {...merged} />
    </NextIntlClientProvider>,
  );
  return merged;
}

afterEach(cleanup);

describe("ConfirmDialog", () => {
  it("is a real dialog, not a native confirm", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete this skill?")).toBeInTheDocument();
    expect(screen.getByText(/repo-conventions/)).toBeInTheDocument();
  });

  it("offers confirm, cancel and a close control", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("confirms only on the confirm button", () => {
    const { onConfirm, onCancel } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels from the cancel button, the ✕ and Escape", () => {
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it("disables both actions while the delete is in flight", () => {
    renderDialog({ busy: true });
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /deleting/i })).toBeDisabled();
  });

  it("says why a delete failed, in the API's own words", () => {
    renderDialog({ error: new ApiError("Skill is linked to a running review", 409) });
    expect(screen.getByRole("alert")).toHaveTextContent("Skill is linked to a running review");
  });

  it("falls back to a generic message for an error without one", () => {
    renderDialog({ error: new Error("") });
    expect(screen.getByRole("alert")).toHaveTextContent(/could not delete/i);
  });

  it("shows no alert until something has failed", () => {
    renderDialog();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("puts focus on the safe answer, so Enter on a fresh dialog does not delete", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: /cancel/i })).toHaveFocus();
  });

  it("keeps Tab inside the dialog", () => {
    renderDialog();
    const close = screen.getByRole("button", { name: /close/i });
    const del = screen.getByRole("button", { name: /^delete$/i });

    del.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(del).toHaveFocus();
  });

  it("gives focus back to whatever opened it", () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <NextIntlClientProvider locale="en" messages={{ common }}>
          <button onClick={() => setOpen(true)}>open dialog</button>
          {open && (
            <ConfirmDialog
              title="Delete this skill?"
              body="gone for good"
              onConfirm={() => {}}
              onCancel={() => setOpen(false)}
            />
          )}
        </NextIntlClientProvider>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "open dialog" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("button", { name: /cancel/i })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(opener).toHaveFocus();
  });
});
