/* SkillFormFields — Name · Description · Type · Body (with live counter), shared
   by CreateSkillModal and the Config tab. Controlled: the parent owns the values. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_BODY_MAX, SKILL_TYPES } from "../constants";
import type { SkillFormErrors, SkillFormValues } from "../helpers";
import { FieldErrorText } from "./FieldErrorText";
import { s } from "./styles";

type EditableField = "name" | "description" | "type" | "body";

export interface SkillFormFieldsProps {
  values: SkillFormValues;
  errors: SkillFormErrors;
  onChange: <K extends EditableField>(field: K, value: SkillFormValues[K]) => void;
  /** Hint under the body (e.g. "Saving a changed body creates a new version"). */
  bodyHint?: string;
  bodyRows?: number;
  /** The body failed the injection scan: red outline around the editor. */
  bodyFlagged?: boolean;
}

export function SkillFormFields({
  values,
  errors,
  onChange,
  bodyHint,
  bodyRows = 12,
  bodyFlagged = false,
}: SkillFormFieldsProps) {
  const t = useTranslations("skills");
  const typeOptions = SKILL_TYPES.map((type) => ({ value: type, label: t(`listItem.type.${type}`) }));
  return (
    <>
      <FormField label={t("form.name")} required hint={t("form.nameHint")}>
        <TextInput
          value={values.name}
          onChange={(v) => onChange("name", v)}
          placeholder={t("form.namePlaceholder")}
          aria-label={t("form.name")}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "skill-name-error" : undefined}
          mono
        />
        <FieldErrorText id="skill-name-error" error={errors.name} />
      </FormField>
      <FormField label={t("form.description")}>
        <TextInput
          value={values.description}
          onChange={(v) => onChange("description", v)}
          placeholder={t("form.descriptionPlaceholder")}
          aria-label={t("form.description")}
          aria-invalid={!!errors.description}
        />
        <FieldErrorText id="skill-description-error" error={errors.description} />
      </FormField>
      <FormField label={t("form.type")}>
        <SelectInput
          value={values.type}
          onChange={(v) => onChange("type", v as SkillType)}
          options={typeOptions}
          mono={false}
        />
      </FormField>
      <FormField
        label={t("form.body")}
        required
        hint={bodyHint}
        right={
          <span className="tnum" style={s.counter(values.body.length > SKILL_BODY_MAX)}>
            {t("form.bodyCounter", { count: values.body.length, max: SKILL_BODY_MAX })}
          </span>
        }
      >
        <div style={s.bodyFrame(bodyFlagged)} data-flagged={bodyFlagged || undefined}>
          <Textarea
            value={values.body}
            onChange={(v) => onChange("body", v)}
            placeholder={t("form.bodyPlaceholder")}
            rows={bodyRows}
            mono
          />
        </div>
        <FieldErrorText id="skill-body-error" error={errors.body} />
      </FormField>
    </>
  );
}
