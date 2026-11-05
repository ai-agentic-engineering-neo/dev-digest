/* ConfirmDialog — small modal confirmation for destructive actions ("Delete
   skill" / "Delete agent"), replacing window.confirm. Cancel is focused first
   so a stray Enter never confirms. While `pending` the dialog is locked: no
   Cancel / ✕ / backdrop / Esc, and the confirm button spins — a second click
   can't fire a second request. An `error` stays inside the dialog so the user
   can retry. Focus is trapped inside (Tab cycles), parked on the dialog while
   pending, and handed back to the opener on close. Labels come from the caller
   (translated), so the component has no i18n namespace of its own. */
"use client";

import React from "react";
import { Button, Modal } from "@devdigest/ui";
import { CONFIRM_DIALOG_WIDTH, FOCUSABLE } from "./constants";
import { s } from "./styles";

export interface ConfirmDialogProps {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  /** Shown on the confirm button while `pending` (e.g. "Deleting…"). */
  pendingLabel: string;
  cancelLabel: string;
  pending?: boolean;
  /** Error from the last attempt, shown in the dialog. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  pending = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const dialogEl = () => rootRef.current?.querySelector<HTMLElement>('[role="dialog"]') ?? null;

  React.useEffect(() => {
    if (pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, onCancel]);

  // Give focus back to whatever opened the dialog (e.g. the trash icon). It is
  // captured on the first render: by the time an effect runs, autoFocus has
  // already moved focus to Cancel.
  const [opener] = React.useState(() =>
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );
  React.useEffect(
    () => () => {
      if (opener?.isConnected) opener.focus();
    },
    [opener],
  );

  // While pending both buttons are disabled, which would drop focus to <body>:
  // park it on the dialog itself so it stays inside.
  React.useEffect(() => {
    const el = dialogEl();
    if (!pending || !el) return;
    el.tabIndex = -1;
    el.focus();
  }, [pending]);

  // Focus trap: Tab / Shift+Tab cycle through the dialog's enabled controls.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const el = dialogEl();
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      e.preventDefault();
      el.tabIndex = -1;
      el.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const inside = el.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div ref={rootRef} onKeyDown={onKeyDown}>
      <Modal
        width={CONFIRM_DIALOG_WIDTH}
        title={title}
        subtitle={body}
        onClose={pending ? undefined : onCancel}
        footer={
          <div style={s.footer}>
            {error && (
              <div role="alert" style={s.error}>
                {error}
              </div>
            )}
            <span style={s.spacer} />
            <Button size="sm" kind="secondary" onClick={onCancel} disabled={pending} autoFocus>
              {cancelLabel}
            </Button>
            <Button size="sm" kind="danger" onClick={onConfirm} loading={pending} disabled={pending}>
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </div>
        }
      />
    </div>
  );
}
