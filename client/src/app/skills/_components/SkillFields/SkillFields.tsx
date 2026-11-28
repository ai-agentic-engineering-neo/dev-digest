/* SkillFields — Name, Description (with the directive hint), Type and the body
   editor. One form for Config, Create and Import. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, TextInput } from "@devdigest/ui";
import { SkillType } from "@devdigest/shared";
import { SkillBodyEditor } from "@/components/skill-body-editor";
import { isSkillType, type SkillDraft } from "../../helpers";
import { s } from "./styles";

export function SkillFields({
  value,
  onChange,
  unsaved,
  serverTokens,
}: {
  value: SkillDraft;
  onChange: (patch: Partial<SkillDraft>) => void;
  unsaved?: boolean;
  serverTokens?: number | null;
}) {
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const typeOptions = SkillType.options.map((v) => ({ value: v, label: tc(`skillType.${v}`) }));
  return (
    <div style={s.wrap}>
      <FormField label={t("fields.name")} hint={t("fields.nameHint")} required>
        <TextInput
          mono
          value={value.name}
          onChange={(name) => onChange({ name })}
          placeholder={t("fields.namePlaceholder")}
        />
      </FormField>
      <FormField label={t("fields.description")} hint={t("fields.descriptionHint")}>
        <TextInput
          value={value.description}
          onChange={(description) => onChange({ description })}
          placeholder={t("fields.descriptionPlaceholder")}
        />
      </FormField>
      <FormField label={t("fields.type")}>
        <SelectInput value={value.type} onChange={(v) => {
            if (isSkillType(v)) onChange({ type: v });
          }} options={typeOptions} />
      </FormField>
      <FormField label={t("fields.body")} required>
        <SkillBodyEditor
          name={value.name}
          value={value.body}
          onChange={(body) => onChange({ body })}
          unsaved={unsaved}
          serverTokens={serverTokens}
          placeholder={t("fields.bodyPlaceholder")}
        />
      </FormField>
    </div>
  );
}
