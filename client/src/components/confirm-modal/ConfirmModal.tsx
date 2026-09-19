"use client";

import React from "react";
import { Button, Modal } from "@devdigest/ui";

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  cancelLabel,
  pending,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      width={440}
      title={title}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="ghost" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button kind="primary" icon="Trash" onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div style={{ padding: "18px 24px", fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.45 }}>
        {body}
      </div>
    </Modal>
  );
}
