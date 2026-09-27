/* ConfirmDialog — the one place a destructive action is confirmed.
   `window.confirm` blocks the main thread, cannot be styled, cannot say what is
   about to be lost beyond one line of plain text, and is invisible to a
   component test. Every delete in the app routes through here instead. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { FOCUSABLE_SELECTOR } from "./constants";
import { confirmErrorMessage } from "./helpers";
import { s } from "./styles";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = true,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive by default — that is what a confirmation is usually for. */
  danger?: boolean;
  busy?: boolean;
  /**
   * The failed attempt's error, raw from the mutation. The dialog stays open on
   * failure, so without this the user clicks Delete, the buttons flicker, and
   * nothing says why.
   */
  error?: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("common");
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const errorMessage = confirmErrorMessage(error, t("confirm.failed"));

  // Focus goes back where it came from — usually the Delete control that
  // opened the dialog — so a keyboard user is not dropped at the top of the page.
  // Captured during the FIRST render: by the time any effect runs, autoFocus
  // has already moved focus onto Cancel, and restoring to that is a no-op.
  const [opener] = React.useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );
  React.useEffect(() => () => opener?.focus?.(), [opener]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape closes, like the overlay click and the header's ✕ — three ways
      // out of a dialog whose default answer is "no".
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      // Keep Tab inside the dialog: behind it is a page the overlay is
      // pretending you cannot reach.
      const dialog = bodyRef.current?.closest('[role="dialog"]');
      if (!dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <Modal
      width={460}
      title={title}
      onClose={onCancel}
      footer={
        <div style={s.footer}>
          {/* Focus starts on the SAFE answer: Enter on a freshly opened
              delete dialog must not delete. */}
          <Button kind="ghost" onClick={onCancel} disabled={busy} autoFocus>
            {cancelLabel ?? t("confirm.cancel")}
          </Button>
          <Button
            kind={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={busy}
            icon={danger ? "Trash" : undefined}
          >
            {busy ? t("confirm.working") : (confirmLabel ?? t("confirm.confirm"))}
          </Button>
        </div>
      }
    >
      <div ref={bodyRef} style={s.body}>
        {body}
        {errorMessage && (
          <div role="alert" style={s.error}>
            {errorMessage}
          </div>
        )}
      </div>
    </Modal>
  );
}
