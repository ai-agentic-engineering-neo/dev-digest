/* DeleteSkillDialog — confirm deleting a skill; lists the agents that use it
   (GET /skills/:id/agents). Links and versions cascade on the server. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill, useSkillUsage } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

export interface DeleteSkillDialogProps {
  skill: Skill;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteSkillDialog({ skill, onClose, onDeleted }: DeleteSkillDialogProps) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: usage, isLoading, isError } = useSkillUsage(skill.id);
  const del = useDeleteSkill();

  const confirm = async () => {
    try {
      await del.mutateAsync(skill.id);
    } catch {
      return; // toasted by the global MutationCache; keep the dialog open
    }
    toast.success(t("deleteDialog.deletedToast", { name: skill.name }));
    onClose();
    onDeleted();
  };

  return (
    <Modal
      width={520}
      title={t("deleteDialog.title", { name: skill.name })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("deleteDialog.cancel")}
          </Button>
          <Button kind="danger" icon="Trash" onClick={confirm} disabled={del.isPending}>
            {del.isPending ? t("deleteDialog.deleting") : t("deleteDialog.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <UsageLine usage={usage} isLoading={isLoading} isError={isError} />
        <p style={s.note}>{t("config.danger.body")}</p>
      </div>
    </Modal>
  );
}

function UsageLine({
  usage,
  isLoading,
  isError,
}: {
  usage?: { agent_name: string }[];
  isLoading: boolean;
  isError: boolean;
}) {
  const t = useTranslations("skills");
  if (isLoading) return <Skeleton height={18} width={260} />;
  if (isError || !usage) return <p style={s.usage}>{t("deleteDialog.loadError")}</p>;
  if (usage.length === 0) return <p style={s.usage}>{t("deleteDialog.unused")}</p>;
  return (
    <p style={s.usage}>
      {t("deleteDialog.usedBy", { count: usage.length, names: usage.map((u) => u.agent_name).join(", ") })}
    </p>
  );
}
