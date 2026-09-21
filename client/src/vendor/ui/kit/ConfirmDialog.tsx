import React from "react";
import { Button } from "../primitives";
import { Modal } from "./Modal";

/** Confirm / cancel modal (with ✕ close). Replaces `window.confirm` for destructive actions. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
  width = 440,
  onConfirm,
  onCancel,
}: {
  title: React.ReactNode;
  message?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  danger?: boolean;
  loading?: boolean;
  width?: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      width={width}
      title={title}
      onClose={onCancel}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button kind={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {message && (
        <div style={{ padding: "18px 24px", fontSize: 13.5, lineHeight: 1.5, color: "var(--text-secondary)" }}>
          {message}
        </div>
      )}
    </Modal>
  );
}
