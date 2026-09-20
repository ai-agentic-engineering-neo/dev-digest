/* CreateSkillModal — name/description/type/body. Mirrors
   agents/_components/AgentsListView/_components/CreateAgentModal. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/api/skills";
import { skillTypeOptions } from "../../helpers";
import { DEFAULT_TYPE, MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [body, setBody] = React.useState("");

  const typeOptions = skillTypeOptions(t);

  const submit = async () => {
    const skill = await create.mutateAsync({
      name: name.trim() || t("create.defaultName"),
      description: description.trim() || t("create.defaultDescription"),
      type,
      body: body.trim() || t("create.defaultBody"),
    });
    onClose();
    router.push(`/skills/${skill.id}`);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("create.fields.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("create.fields.namePlaceholder")} />
        </FormField>
        <FormField label={t("create.fields.description")} required hint={t("config.descriptionHint")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("create.fields.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("create.fields.type")}>
          <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
        </FormField>
        <FormField label={t("create.fields.body")}>
          <Textarea value={body} onChange={setBody} rows={8} mono placeholder={t("create.fields.bodyPlaceholder")} />
        </FormField>
      </div>
    </Modal>
  );
}
