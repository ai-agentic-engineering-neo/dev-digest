/* SkillMetaFields — the Name / Description / Type fields shared by the create
   modal, the import preview and the editor's Config tab. Name is validated
   inline with the contract slug rule. */
"use client";

import { useTranslations } from "next-intl";
import { FormField, SelectInput, TextInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_DESCRIPTION_MAX, SKILL_NAME_MAX } from "@devdigest/shared/constants/skills";
import { SKILL_TYPES } from "../../constants";
import { isValidSkillName } from "../../helpers";
import { s } from "./styles";

export interface SkillMetaValue {
  name: string;
  description: string;
  type: SkillType;
}

export function SkillMetaFields({
  value,
  onChange,
}: {
  value: SkillMetaValue;
  onChange: <K extends keyof SkillMetaValue>(key: K, v: SkillMetaValue[K]) => void;
}) {
  const t = useTranslations("skills");
  const nameInvalid = value.name.length > 0 && !isValidSkillName(value.name);
  const typeOptions = SKILL_TYPES.map((ty) => ({ value: ty, label: t(`type.${ty}`) }));

  return (
    <>
      <FormField
        label={t("fields.name")}
        required
        hint={nameInvalid ? <span style={s.error}>{t("fields.nameError", { max: SKILL_NAME_MAX })}</span> : undefined}
      >
        <TextInput
          value={value.name}
          onChange={(v) => onChange("name", v)}
          placeholder={t("fields.namePlaceholder")}
          aria-label={t("fields.name")}
          aria-invalid={nameInvalid}
          maxLength={SKILL_NAME_MAX}
          suffix={<span style={s.suffix}>.md</span>}
          mono
        />
      </FormField>
      <FormField
        label={t("fields.description")}
        hint={t("fields.descriptionHint")}
        right={
          <span className="tnum" style={s.count}>
            {t("fields.descriptionCount", { count: value.description.length, max: SKILL_DESCRIPTION_MAX })}
          </span>
        }
      >
        <TextInput
          value={value.description}
          onChange={(v) => onChange("description", v)}
          placeholder={t("fields.descriptionPlaceholder")}
          aria-label={t("fields.description")}
          maxLength={SKILL_DESCRIPTION_MAX}
        />
      </FormField>
      <FormField label={t("fields.type")}>
        <SelectInput value={value.type} onChange={(v) => onChange("type", v as SkillType)} options={typeOptions} mono={false} />
      </FormField>
    </>
  );
}
