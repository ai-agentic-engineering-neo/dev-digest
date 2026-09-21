"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Textarea, Toggle, Button, Icon } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill, useDeleteSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { needsVetting } from "@/app/skills/_components/SkillRow";
import { BODY_ROWS, SKILL_TYPE_VALUES } from "./constants";
import { s } from "./styles";

/** Config tab — name/description/type/body + enabled toggle, plus delete. */
export function SkillConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);

  // Reset local form when switching skills.
  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The list/side-panel toggles save `enabled` immediately. Follow the server value so
  // Save here can't write a stale `enabled` back over it.
  React.useEffect(() => {
    setEnabled(skill.enabled);
  }, [skill.enabled]);

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body, enabled } },
      {
        // Failures are surfaced by the global mutation error toast.
        onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })),
      },
    );

  const remove = () => {
    if (!window.confirm(t("config.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("config.deleteToast"));
        router.push("/skills");
      },
    });
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>
      {needsVetting(skill.source) && (
        <div role="note" style={s.notice}>
          <Icon.Info size={15} style={s.noticeIcon} />
          <span>{t("preview.untrustedNotice")}</span>
        </div>
      )}
      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={setName} mono />
      </FormField>
      <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("config.body")} hint={t("preview.bodyHint")}>
        <Textarea value={body} onChange={setBody} rows={BODY_ROWS} mono />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending || !name.trim()}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {update.isSuccess && <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>}
        <div style={s.spacer} />
        <Button kind="danger" icon="Trash" onClick={remove} disabled={del.isPending}>
          {t("config.delete")}
        </Button>
      </div>
    </div>
  );
}
