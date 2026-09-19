"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { SKILL_TYPE_VALUES } from "../../../../constants";
import { isValidSkillName } from "../../../../helpers";
import { DEFAULT_BODY, MODAL_WIDTH } from "./constants";
import { s } from "./styles";

/** Create-from-scratch modal — the manual path onto `/skills` (D6 covers import). */
export function NewSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [body, setBody] = React.useState(DEFAULT_BODY);
  const [touched, setTouched] = React.useState(false);

  const nameValid = isValidSkillName(name);
  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const submit = async () => {
    setTouched(true);
    if (!nameValid) return;
    const skill = await create.mutateAsync({ name, description, type, body, source: "manual" });
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("newSkill.title")}
      subtitle={t("newSkill.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("newSkill.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("newSkill.creating") : t("newSkill.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("newSkill.fields.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("file.namePlaceholder")} mono />
          {touched && !nameValid && <div style={s.slugError}>{t("newSkill.slugError")}</div>}
        </FormField>
        <FormField label={t("newSkill.fields.description")} hint={t("config.descriptionHint")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("newSkill.fields.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("newSkill.fields.type")}>
          <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} mono={false} />
        </FormField>
        <FormField label={t("newSkill.fields.body")}>
          <Textarea value={body} onChange={setBody} rows={8} mono />
        </FormField>
      </div>
    </Modal>
  );
}
