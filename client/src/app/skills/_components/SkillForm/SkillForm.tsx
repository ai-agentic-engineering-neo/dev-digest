"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Textarea, Toggle } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { BODY_ROWS, SKILL_TYPE_VALUES } from "./constants";

/** The editable fields of a skill: shared by create, import-preview and edit. */
export interface SkillFormValue {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
}

export function SkillForm({
  value,
  onChange,
  showEnabled = true,
}: {
  value: SkillFormValue;
  onChange: (next: SkillFormValue) => void;
  showEnabled?: boolean;
}) {
  const t = useTranslations("skills");
  const set = <K extends keyof SkillFormValue>(key: K, v: SkillFormValue[K]) => onChange({ ...value, [key]: v });
  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`card.type.${v}`) }));
  return (
    <>
      <FormField label={t("form.name")} hint={t("form.nameHint")} required>
        <TextInput value={value.name} onChange={(v) => set("name", v)} placeholder={t("form.namePlaceholder")} mono />
      </FormField>
      <FormField label={t("form.description")} hint={t("form.descriptionHint")}>
        <TextInput
          value={value.description}
          onChange={(v) => set("description", v)}
          placeholder={t("form.descriptionPlaceholder")}
        />
      </FormField>
      <FormField label={t("form.type")}>
        <SelectInput value={value.type} onChange={(v) => set("type", v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("form.body")} hint={t("form.bodyHint")} required>
        <Textarea
          value={value.body}
          onChange={(v) => set("body", v)}
          rows={BODY_ROWS}
          mono
          placeholder={t("form.bodyPlaceholder")}
        />
      </FormField>
      {showEnabled && (
        <FormField label={t("form.enabled")} hint={t("form.enabledHint")}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-secondary)" }}>
            <Toggle on={value.enabled} onChange={(v) => set("enabled", v)} size={16} />
            {t("form.enabled")}
          </label>
        </FormField>
      )}
    </>
  );
}
