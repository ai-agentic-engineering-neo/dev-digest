/* ConfirmDialog — a modal confirmation (confirm / cancel / close icon / Escape)
   used before destructive actions instead of window.confirm. Focus lands on
   Cancel so a stray Enter never confirms. */
"use client";

import React from "react";
import { Button, Modal } from "@devdigest/ui";
import { s } from "./styles";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = true,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
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
          <Button kind="ghost" onClick={onCancel} disabled={pending} autoFocus>
            {cancelLabel}
          </Button>
          <Button kind={danger ? "danger" : "primary"} onClick={onConfirm} disabled={pending} icon={danger ? "Trash" : "Check"}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {body && <div style={s.body}>{body}</div>}
    </Modal>
  );
}
