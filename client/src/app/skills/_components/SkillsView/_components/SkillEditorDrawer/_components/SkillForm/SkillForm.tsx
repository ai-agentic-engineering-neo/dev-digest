"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, Textarea, TextInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "@/lib/skills";
import { SKILL_FIELD_MAX as FIELD_MAX, type FieldErrors, type SkillFormValues } from "@/lib/skill-form";
import { s } from "./styles";

interface Props {
  values: SkillFormValues;
  errors: FieldErrors;
  onChange: (patch: Partial<SkillFormValues>) => void;
  /** Hide the body editor (import preview shows the body read-only instead). */
  showBody?: boolean;
}

/** Name / description / type / body fields for create and import-confirm. */
export function SkillForm({ values, errors, onChange, showBody = true }: Props) {
  const t = useTranslations("skills");
  const err = (f: keyof SkillFormValues) => {
    const e = errors[f];
    return e ? <div role="alert" style={s.error}>{t(`editor.errors.${e.code}`, { max: e.max ?? 0 })}</div> : null;
  };
  const counter = (f: keyof typeof FIELD_MAX) => (
    <span style={values[f].length > FIELD_MAX[f] ? s.counterOver : s.counter}>
      {t("editor.fields.counter", { count: values[f].length, max: FIELD_MAX[f] })}
    </span>
  );
  return (
    <div>
      <FormField label={t("editor.fields.name")} required right={counter("name")}>
        <TextInput
          mono
          aria-label={t("editor.fields.name")}
          value={values.name}
          placeholder={t("editor.fields.namePlaceholder")}
          onChange={(v) => onChange({ name: v })}
        />
        {err("name")}
      </FormField>
      <FormField
        label={t("editor.fields.description")}
        required
        hint={t("editor.fields.descriptionHint")}
        right={counter("description")}
      >
        <Textarea
          rows={3}
          value={values.description}
          placeholder={t("editor.fields.descriptionPlaceholder")}
          onChange={(v) => onChange({ description: v })}
        />
        {err("description")}
      </FormField>
      <FormField label={t("editor.fields.type")} required>
        <SelectInput
          mono={false}
          value={values.type}
          onChange={(v) => onChange({ type: v as SkillType })}
          options={SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }))}
        />
        {err("type")}
      </FormField>
      {showBody && (
        <FormField label={t("editor.fields.body")} required right={counter("body")}>
          <Textarea
            mono
            rows={14}
            value={values.body}
            placeholder={t("editor.fields.bodyPlaceholder")}
            onChange={(v) => onChange({ body: v })}
          />
          {err("body")}
        </FormField>
      )}
    </div>
  );
}
