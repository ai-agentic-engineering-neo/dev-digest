/* CreateSkillModal — author a skill from scratch. The description field carries
   the hint that it is the skill's interface, because that is the field people
   fill in last and least carefully. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { SKILL_TYPES } from "../../constants";
import { s } from "./styles";

export function CreateSkillModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [body, setBody] = React.useState(t("create.defaultBody"));
  const [error, setError] = React.useState<string | null>(null);

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const submit = async () => {
    setError(null);
    try {
      const skill = await create.mutateAsync({ name: name.trim(), description, type, body });
      onCreated?.(skill);
      onClose();
    } catch (err) {
      // Thrown from an event handler, so no error boundary would ever see it:
      // without this the modal just sits there and the user learns nothing.
      setError(err instanceof ApiError ? err.message : t("create.failed"));
    }
  };

  return (
    <Modal
      width={720}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Plus"
            onClick={submit}
            disabled={create.isPending || !name.trim() || !body.trim()}
          >
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {error && (
          <div role="alert" style={s.error}>
            {error}
          </div>
        )}
        <FormField label={t("config.name")} hint={t("config.nameHint")} required>
          <TextInput value={name} onChange={setName} placeholder={t("config.namePlaceholder")} />
        </FormField>
        <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("config.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("config.type")}>
          <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
        </FormField>
        <FormField label={t("config.body")} hint={t("config.bodyHint")} required>
          <Textarea value={body} onChange={setBody} rows={10} mono />
        </FormField>
      </div>
    </Modal>
  );
}
