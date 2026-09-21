"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { DEFAULT_TYPE, MODAL_WIDTH, TYPE_OPTIONS } from "./constants";
import { s } from "./styles";

/** Create-skill modal — name/description/type/body. */
export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [body, setBody] = React.useState(t("createModal.defaultBody"));

  const submit = async () => {
    const skill = await create.mutateAsync({
      name: name.trim() || t("createModal.defaultName"),
      description,
      type,
      body,
    });
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("createModal.title")}
      subtitle={t("createModal.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("createModal.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("createModal.creating") : t("createModal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("createModal.fields.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("createModal.fields.namePlaceholder")} />
        </FormField>
        <FormField label={t("createModal.fields.description")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("createModal.fields.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("createModal.fields.type")}>
          <SelectInput
            value={type}
            onChange={(v) => setType(v as SkillType)}
            options={TYPE_OPTIONS.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }))}
          />
        </FormField>
        <FormField label={t("createModal.fields.body")}>
          <Textarea value={body} onChange={setBody} rows={8} mono />
        </FormField>
      </div>
    </Modal>
  );
}
