/* RestoreConfirmModal — confirm before restoring v{n} as a NEW version (history is never rewritten). */
"use client";

import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { s } from "./styles";

export function RestoreConfirmModal({
  version,
  nextVersion,
  isPending,
  onConfirm,
  onCancel,
}: {
  version: number;
  nextVersion: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("skills.versions");
  return (
    <Modal
      width={460}
      title={t("confirmTitle", { version })}
      onClose={onCancel}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onCancel} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button kind="primary" icon="History" onClick={onConfirm} loading={isPending}>
            {t("confirm")}
          </Button>
        </div>
      }
    >
      <p style={s.body}>{t("confirmBody", { version, next: nextVersion })}</p>
    </Modal>
  );
}
