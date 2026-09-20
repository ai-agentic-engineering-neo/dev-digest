"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Textarea, Toggle, Button } from "@devdigest/ui";
import type { Skill, SkillType, UpdateSkillInput } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "@/lib/api/skills";
import { useToast } from "@/lib/toast";
import { TYPE_VALUES } from "./constants";
import { s } from "./styles";

/** Draft shape mirrors the PUT /skills/:id payload, so `save` can send it as-is. */
type Draft = Required<UpdateSkillInput>;

function toDraft(skill: Skill): Draft {
  return {
    name: skill.name,
    description: skill.description,
    type: skill.type,
    body: skill.body,
    enabled: skill.enabled,
  };
}

/** Config tab — name/description/type/body + enabled toggle + danger zone.
    Parent remounts this via `key={skill.id}` on skill switch, so the draft
    only ever needs to be initialized once per mount — no reset effect. */
export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(skill));
  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const save = () =>
    update.mutate(
      { id: skill.id, patch: draft },
      {
        onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })),
      },
    );

  const remove = () => {
    if (!window.confirm(t("config.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("config.deletedToast"));
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
          <Toggle on={draft.enabled} onChange={(v) => patch("enabled", v)} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={draft.name} onChange={(v) => patch("name", v)} />
      </FormField>
      <FormField label={t("config.description")} required hint={t("config.descriptionHint")}>
        <TextInput value={draft.description} onChange={(v) => patch("description", v)} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={draft.type} onChange={(v) => patch("type", v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("config.body")}>
        <Textarea value={draft.body} onChange={(v) => patch("body", v)} rows={14} mono />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
      </div>
      <div style={s.dangerZone}>
        <div>
          <div style={s.dangerTitle}>{t("config.dangerTitle")}</div>
          <div style={s.dangerBody}>{t("config.dangerBody")}</div>
        </div>
        <Button kind="danger" icon="Trash" onClick={remove} disabled={del.isPending}>
          {t("config.delete")}
        </Button>
      </div>
    </div>
  );
}
