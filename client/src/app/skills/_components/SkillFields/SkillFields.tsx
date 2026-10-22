/* SkillFields — the name / description / type / body inputs shared by Create,
   import preview and the Config tab. Controlled: the parent owns the values. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "./constants";
import { approxTokens } from "./helpers";
import { s } from "./styles";

export interface SkillFieldValues {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export function SkillFields({
  value,
  onChange,
  bodyRows = 14,
  bodyReadOnly,
  showBodyHint = true,
}: {
  value: SkillFieldValues;
  onChange: (next: SkillFieldValues) => void;
  bodyRows?: number;
  /** Import preview shows the body as-is: the user reads it, not edits it. */
  bodyReadOnly?: boolean;
  showBodyHint?: boolean;
}) {
  const t = useTranslations("skills");
  const set = <K extends keyof SkillFieldValues>(key: K) => (v: SkillFieldValues[K]) =>
    onChange({ ...value, [key]: v });
  const typeOptions = SKILL_TYPES.map((ty) => ({ value: ty, label: t(`typeLabel.${ty}`) }));

  return (
    <>
      <FormField label={t("fields.name")} required>
        <TextInput value={value.name} onChange={set("name")} placeholder={t("fields.namePlaceholder")} maxLength={120} />
      </FormField>
      <FormField label={t("fields.description")} hint={t("fields.descriptionHint")}>
        <TextInput
          value={value.description}
          onChange={set("description")}
          placeholder={t("fields.descriptionPlaceholder")}
          maxLength={1000}
        />
      </FormField>
      <FormField label={t("fields.type")}>
        <SelectInput value={value.type} onChange={(v) => set("type")(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField
        label={t("fields.body")}
        required
        hint={showBodyHint ? t("fields.bodyHint") : undefined}
        right={
          <span className="mono" style={s.tokens}>
            {t("fields.tokens", { count: approxTokens(value.body) })}
          </span>
        }
      >
        {bodyReadOnly ? (
          <pre className="mono" style={s.readOnlyBody(bodyRows)}>
            {value.body}
          </pre>
        ) : (
          <Textarea value={value.body} onChange={set("body")} rows={bodyRows} mono placeholder={t("fields.bodyPlaceholder")} />
        )}
      </FormField>
    </>
  );
}

