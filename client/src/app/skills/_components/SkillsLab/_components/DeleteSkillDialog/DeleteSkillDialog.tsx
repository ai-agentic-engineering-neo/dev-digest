/* DeleteSkillDialog — "Delete skill" confirmation modal used by the card trash
   icon and the Config tab's Delete button. Owns the DELETE request: locked
   while it runs, toast + onDeleted on success, error kept in the dialog. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useDeleteSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { errorMessage } from "@/lib/error-message";

export function DeleteSkillDialog({
  skill,
  onClose,
  onDeleted,
}: {
  skill: Skill;
  onClose: () => void;
  onDeleted: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const del = useDeleteSkill();
  const [error, setError] = React.useState<string | null>(null);

  const confirm = () => {
    if (del.isPending) return;
    setError(null);
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("config.deleted"));
        onDeleted(skill);
      },
      onError: (e) => setError(errorMessage(e)),
    });
  };

  return (
    <ConfirmDialog
      title={t("deleteDialog.title")}
      body={t("deleteDialog.body", { name: skill.name })}
      confirmLabel={t("deleteDialog.confirm")}
      pendingLabel={t("deleteDialog.pending")}
      cancelLabel={t("deleteDialog.cancel")}
      pending={del.isPending}
      error={error}
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}
