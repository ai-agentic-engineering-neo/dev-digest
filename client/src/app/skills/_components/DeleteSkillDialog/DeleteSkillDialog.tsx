/* DeleteSkillDialog — confirm modal + delete mutation shared by the skill list row
   and the Config tab. Mount it only while confirming; it closes itself on success. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";

export interface DeleteSkillDialogProps {
  skill: Pick<Skill, "id" | "name">;
  /** Agents the skill is linked to; omit when unknown (generic "every agent" copy). */
  usedBy?: number;
  onClose: () => void;
  /** Called after the server confirmed the delete. */
  onDeleted?: () => void;
}

export function DeleteSkillDialog({ skill, usedBy, onClose, onDeleted }: DeleteSkillDialogProps) {
  const t = useTranslations("skills");
  const toast = useToast();
  const del = useDeleteSkill();

  const message =
    usedBy === undefined
      ? t("delete.messageGeneric", { name: skill.name })
      : usedBy === 0
        ? t("delete.messageUnused", { name: skill.name })
        : t("delete.message", { name: skill.name, count: usedBy });

  const confirm = () =>
    del.mutate(skill.id, {
      // Failures are surfaced by the global mutation error toast; the dialog stays open to retry.
      onSuccess: () => {
        toast.success(t("delete.toast"));
        onClose();
        onDeleted?.();
      },
    });

  return (
    <ConfirmDialog
      danger
      title={t("delete.title", { name: skill.name })}
      message={message}
      confirmLabel={t("delete.confirm")}
      cancelLabel={t("delete.cancel")}
      loading={del.isPending}
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}
