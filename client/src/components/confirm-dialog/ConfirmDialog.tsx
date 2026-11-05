/* ConfirmDialog — small modal confirmation for destructive actions ("Delete
   skill" / "Delete agent"), replacing window.confirm. Cancel is focused first
   so a stray Enter never confirms. While `pending` the dialog is locked: no
   Cancel / ✕ / backdrop / Esc, and the confirm button spins — a second click
   can't fire a second request. An `error` stays inside the dialog so the user
   can retry. Labels come from the caller (translated), so the component has no
   i18n namespace of its own. */
"use client";

import React from "react";
import { Button, Modal } from "@devdigest/ui";
import { CONFIRM_DIALOG_WIDTH } from "./constants";
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
  React.useEffect(() => {
    if (pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, onCancel]);

  return (
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
  );
}
