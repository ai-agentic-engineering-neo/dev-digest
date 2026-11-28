/* ConfigTab — edit a skill: name, directive description, type, markdown body,
   global enabled switch, and an optional change note that is stored with the
   new version when the body changes. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, SelectInput, Textarea, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "@/components/skill-badges";
import { useDeleteSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { approxTokens, buildPatch, draftFrom, type SkillDraft } from "./helpers";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [d, setD] = React.useState<SkillDraft>(() => draftFrom(skill));
  const set = <K extends keyof SkillDraft>(k: K) => (v: SkillDraft[K]) => setD((p) => ({ ...p, [k]: v }));

  const patch = buildPatch(skill, d);
  const dirty = Object.keys(patch).length > 0;
  const bodyChanged = patch.body !== undefined;

  const save = () =>
    update.mutate(
      { id: skill.id, patch },
      {
        onSuccess: (next) =>
          toast.success(
            next.version !== skill.version
              ? t("config.savedToast", { version: next.version })
              : t("config.savedMetaToast"),
          ),
      },
    );

  const remove = () => {
    if (!window.confirm(t("config.confirmDelete", { name: skill.name }))) return;
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
          <Toggle on={d.enabled} onChange={set("enabled")} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} hint={t("config.nameHint")} required>
        <TextInput value={d.name} onChange={set("name")} mono />
      </FormField>
      <FormField label={t("config.description")} hint={t("config.descriptionHint")} required>
        <TextInput value={d.description} onChange={set("description")} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput
          value={d.type}
          onChange={(v) => set("type")(v as SkillType)}
          options={SKILL_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }))}
        />
      </FormField>
      <FormField
        label={t("config.body")}
        hint={t("config.bodyHint")}
        right={<span className="tnum" style={s.tokens}>{t("config.tokens", { count: approxTokens(d.body) })}</span>}
      >
        <Textarea value={d.body} onChange={set("body")} rows={16} mono />
      </FormField>
      {bodyChanged && (
        <FormField label={t("config.changeNote")} hint={t("config.changeNoteHint")}>
          <TextInput value={d.changeNote} onChange={set("changeNote")} placeholder={t("config.changeNotePlaceholder")} />
        </FormField>
      )}
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        <Button kind="ghost" onClick={() => setD(draftFrom(skill))} disabled={!dirty}>
          {t("config.cancel")}
        </Button>
        <div style={s.deleteWrap}>
          <Button kind="danger" icon="Trash" size="sm" onClick={remove} disabled={del.isPending}>
            {t("config.delete")}
          </Button>
        </div>
      </div>
    </div>
  );
}
