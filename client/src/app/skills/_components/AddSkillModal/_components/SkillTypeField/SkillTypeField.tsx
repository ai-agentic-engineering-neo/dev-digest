"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "../../constants";

/** Labelled skill-type select shared by the three tabs. */
export function SkillTypeField({ value, onChange }: { value: SkillType; onChange: (type: SkillType) => void }) {
  const t = useTranslations("skills");
  const ti = useTranslations("skillsImport");
  // Capitalised in the picker ("Rubric"); the lower-case tag labels stay for the list cards.
  const options = SKILL_TYPES.map((v) => {
    const label = t(`listItem.type.${v}`);
    return { value: v, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });
  return (
    <FormField label={ti("fields.type")}>
      <SelectInput value={value} onChange={(v) => onChange(v as SkillType)} options={options} />
    </FormField>
  );
}
