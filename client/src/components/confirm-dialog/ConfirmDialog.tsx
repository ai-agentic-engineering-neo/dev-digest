/* ConfirmDialog — replaces window.confirm with a Modal that follows the theme,
   is testable, and does not block the event loop. Controlled: the caller (or
   `useConfirm`) owns the open state. Esc cancels. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Button } from "@devdigest/ui";
import { useKeydown } from "@/lib/hooks/useKeydown";
import { s } from "./styles";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("common");
  useKeydown((e) => {
    if (e.key === "Escape") onCancel();
  });
  return (
    // The dialog is a DOM child of whatever renders it (often a clickable card
    // or accordion header): stop clicks here from reaching that parent's onClick.
    <div onClick={(e) => e.stopPropagation()}>
      <Modal
        width={440}
        title={title}
        onClose={onCancel}
        footer={
          <div style={s.footer}>
            <Button kind="ghost" onClick={onCancel}>
              {t("actions.cancel")}
            </Button>
            <Button kind="danger" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        }
      >
        <p style={s.body}>{body}</p>
      </Modal>
    </div>
  );
}
