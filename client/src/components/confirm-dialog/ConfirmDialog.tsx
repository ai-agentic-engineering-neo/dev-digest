/* ConfirmDialog — accessible replacement for window.confirm. Controlled: the
   caller owns the "pending" state and renders it while a confirmation is open.
   Focus starts on Cancel so a stray Enter never confirms a destructive action. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { s } from "./styles";

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("common");
  return (
    <Modal
      width={440}
      title={title}
      onClose={onCancel}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onCancel} data-autofocus>
            {t("actions.cancel")}
          </Button>
          <Button kind="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p style={s.message}>{message}</p>
    </Modal>
  );
}
