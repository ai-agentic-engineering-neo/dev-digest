/* NewSkillModal — create a skill from scratch, then open its editor. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, Textarea } from "@devdigest/ui";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { SkillTypeSelect } from "@/components/skill-type-select";
import { DEFAULT_NEW_TYPE, MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function NewSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState(DEFAULT_NEW_TYPE);
  const [body, setBody] = React.useState("");

  const canSubmit = name.trim().length > 0 && type.trim().length > 0 && body.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const skill = await create.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        type: type.trim(),
        body,
      });
      onClose();
      router.push(`/skills/${skill.id}?tab=config`);
    } catch {
      // Keep the modal open so the user can retry — the global mutation-error
      // toast (client/src/lib/providers.tsx) already reported the failure.
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("page.menu.create")}
      subtitle={t("page.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={!canSubmit || create.isPending}>
            {create.isPending ? t("import.creating") : t("import.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("config.nameLabel")} required>
          <TextInput value={name} onChange={setName} placeholder={t("config.namePlaceholder")} />
        </FormField>
        <FormField label={t("config.descriptionLabel")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("config.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("config.typeLabel")} hint={t("config.typeHint")} required>
          <SkillTypeSelect value={type} onChange={setType} />
        </FormField>
        <FormField label={t("config.bodyLabel")} hint={t("config.bodyHint")} required>
          <Textarea value={body} onChange={setBody} rows={10} mono />
        </FormField>
      </div>
    </Modal>
  );
}
