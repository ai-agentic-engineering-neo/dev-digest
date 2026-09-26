"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { ConfirmDialog } from "../../../../../../../components/confirm-dialog";
import { SkillForm, toSkillFormValue, type SkillFormValue } from "../../../../../_components/SkillForm";
import { s } from "../../styles";

/** Config tab — the full skill form with Save and Delete (confirmed in a modal). */
export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  // Keyed by skill id and version from the parent, so a saved or restored body
  // remounts the form with fresh values.
  const [form, setForm] = React.useState<SkillFormValue>(() => toSkillFormValue(skill));
  const [confirming, setConfirming] = React.useState(false);

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { ...form, name: form.name.trim() } },
      { onSuccess: (data) => toast.success(t("panel.savedToast", { version: data.version })) },
    );
  const remove = () =>
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("panel.deletedToast"));
        router.replace("/skills");
      },
    });

  return (
    <div style={s.wrap}>
      {confirming && (
        <ConfirmDialog
          title={t("confirm.title", { name: skill.name })}
          body={t("confirm.body")}
          confirmLabel={t("confirm.confirm")}
          cancelLabel={t("confirm.cancel")}
          pending={del.isPending}
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
      )}
      <h2 style={s.h2}>{t("editor.config.title")}</h2>
      <SkillForm value={form} onChange={setForm} />
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending || !form.name.trim() || !form.body.trim()}>
          {update.isPending ? t("editor.config.saving") : t("editor.config.save")}
        </Button>
        <span style={{ flex: 1 }} />
        <Button kind="danger" icon="Trash" onClick={() => setConfirming(true)}>
          {t("editor.config.delete")}
        </Button>
      </div>
    </div>
  );
}
