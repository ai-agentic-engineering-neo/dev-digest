/* SkillConfigTab — edit the skill in place: name, description, type, body.
   The draft lives in the parent so switching to Preview does not lose it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { BODY_ROWS, TYPE_OPTIONS } from "../../../_components/SkillEditorModal/constants";
import type { SkillDraft } from "../SkillDetailView/helpers";
import { s } from "./styles";

export function SkillConfigTab({
  skill,
  draft,
  dirty,
  saving,
  onChange,
  onSave,
  onRevert,
}: {
  skill: Skill;
  draft: SkillDraft;
  dirty: boolean;
  saving: boolean;
  onChange: (draft: SkillDraft) => void;
  onSave: () => Promise<void>;
  onRevert: () => void;
}) {
  const t = useTranslations("skills");
  const [error, setError] = React.useState<string | null>(null);

  const set = <K extends keyof SkillDraft>(key: K, value: SkillDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const submit = async () => {
    setError(null);
    try {
      await onSave();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const canSave = dirty && draft.name.trim().length > 0 && draft.body.trim().length > 0 && !saving;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.heading")}</h2>
        <Badge color="var(--text-muted)" mono>
          {t("preview.version", { version: skill.version })}
        </Badge>
        {dirty && <Badge color="var(--warn)">{t("config.unsaved")}</Badge>}
      </div>

      <FormField label={t("editor.fields.name")} hint={t("editor.fields.nameHint")} required>
        <TextInput value={draft.name} onChange={(v) => set("name", v)} mono />
      </FormField>

      <FormField
        label={t("editor.fields.description")}
        hint={t("editor.fields.descriptionHint")}
      >
        <TextInput
          value={draft.description}
          onChange={(v) => set("description", v)}
          placeholder={t("editor.fields.descriptionPlaceholder")}
        />
      </FormField>

      <FormField label={t("editor.fields.type")} hint={t("editor.fields.typeHint")}>
        <SelectInput
          value={draft.type}
          onChange={(v) => set("type", v as SkillType)}
          options={TYPE_OPTIONS.map((value) => ({ value, label: t(`listItem.type.${value}`) }))}
        />
      </FormField>

      <FormField label={t("editor.fields.body")} hint={t("preview.bodyHint")} required>
        <div>
          <div style={s.bodyHeader}>
            <span className="mono" style={s.fileName}>
              {t("config.bodyFileName", { name: skill.name })}
            </span>
            <span className="tnum" style={s.charCount}>
              {t("config.charCount", { count: draft.body.length })}
            </span>
          </div>
          <Textarea value={draft.body} onChange={(v) => set("body", v)} rows={BODY_ROWS} mono />
        </div>
      </FormField>

      <div style={s.actions}>
        {error && <span style={s.error}>{error}</span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <Button kind="ghost" onClick={onRevert} disabled={!dirty || saving}>
            {t("config.revert")}
          </Button>
          <Button kind="primary" icon="Check" onClick={submit} disabled={!canSave}>
            {saving ? t("config.saving") : t("config.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
