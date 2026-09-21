/* ConfirmDialog — a blocking yes/no for a destructive action.
   Replaces window.confirm so the question is themed, readable, and can name
   the consequence rather than just the action. */
"use client";

import React from "react";
import { Button, Icon, Modal } from "@devdigest/ui";
import { CONFIRM_WIDTH } from "./constants";
import { s } from "./styles";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  pending = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Keeps the dialog open and the buttons locked while the action runs. */
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      width={CONFIRM_WIDTH}
      title={title}
      onClose={pending ? undefined : onCancel}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button kind="danger" icon="Trash" onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <Icon.AlertTriangle size={18} style={s.icon} />
        <p style={s.text}>{body}</p>
      </div>
    </Modal>
  );
}
