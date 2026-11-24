/* SkillForm — the editable skill fields (name, description, type, optional
   enabled toggle, markdown body). Controlled; shared by SkillEditorModal and the
   skill page's Config tab so the two never drift. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Textarea, Toggle } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "@/lib/skill-type";
import type { Draft, FieldErrors } from "@/components/skill-editor-modal/helpers";
import { s } from "./styles";

const BODY_ROWS = 12;

export function SkillForm({
  draft,
  onChange,
  errors = {},
  enabled,
  onEnabledChange,
  bodyHint,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  errors?: FieldErrors;
  /** Pass both to render the Enabled toggle. */
  enabled?: boolean;
  onEnabledChange?: (v: boolean) => void;
  /** Show the "saving a changed body creates a new version" hint. */
  bodyHint?: boolean;
}) {
  const t = useTranslations("skills");
  const required = (k: keyof FieldErrors) =>
    errors[k] ? (
      <div role="alert" style={s.error}>
        {t("editor.errors.required")}
      </div>
    ) : null;

  return (
    <>
      <FormField label={t("editor.fields.name")} required>
        <TextInput
          value={draft.name}
          onChange={(name) => onChange({ name })}
          mono
          placeholder={t("editor.fields.namePlaceholder")}
        />
        {required("name")}
      </FormField>
      <FormField label={t("editor.fields.description")} required hint={t("editor.fields.descriptionHint")}>
        <TextInput
          value={draft.description}
          onChange={(description) => onChange({ description })}
          placeholder={t("editor.fields.descriptionPlaceholder")}
        />
        {required("description")}
      </FormField>
      <FormField label={t("editor.fields.type")}>
        <SelectInput
          value={draft.type}
          onChange={(v) => onChange({ type: v as SkillType })}
          options={SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }))}
        />
      </FormField>
      {onEnabledChange && (
        <FormField label={t("editor.fields.enabled")} hint={t("editor.fields.enabledHint")}>
          <Toggle on={!!enabled} onChange={onEnabledChange} />
        </FormField>
      )}
      <FormField label={t("editor.fields.body")} required hint={bodyHint ? t("editor.fields.bodyHint") : undefined}>
        <Textarea
          value={draft.body}
          onChange={(body) => onChange({ body })}
          rows={BODY_ROWS}
          mono
          placeholder={t("editor.fields.bodyPlaceholder")}
        />
        {required("body")}
      </FormField>
    </>
  );
}
