/* SkillEditorModal — create or edit a skill: name, description, type, body.
   The same form serves both, because "create" and "edit" differ only in which
   mutation fires and whether the fields start empty. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill, useUpdateSkill } from "../../../../lib/hooks/skills";
import { BODY_ROWS, MODAL_WIDTH, TYPE_OPTIONS } from "./constants";
import { s } from "./styles";

export function SkillEditorModal({
  skill,
  onClose,
  onSaved,
}: {
  /** Omitted when creating. */
  skill?: Skill;
  onClose: () => void;
  onSaved?: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const create = useCreateSkill();
  const update = useUpdateSkill();

  const [name, setName] = React.useState(skill?.name ?? "");
  const [description, setDescription] = React.useState(skill?.description ?? "");
  const [type, setType] = React.useState<SkillType>(skill?.type ?? "custom");
  const [body, setBody] = React.useState(skill?.body ?? "");
  const [error, setError] = React.useState<string | null>(null);

  const pending = create.isPending || update.isPending;
  const canSave = name.trim().length > 0 && body.trim().length > 0 && !pending;

  const submit = async () => {
    setError(null);
    try {
      const saved = skill
        ? await update.mutateAsync({
            id: skill.id,
            patch: { name: name.trim(), description, type, body },
          })
        : await create.mutateAsync({ name: name.trim(), description, type, body });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={skill ? t("editor.editTitle") : t("editor.createTitle")}
      subtitle={t("editor.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {error && <span style={s.error}>{error}</span>}
          <Button kind="ghost" onClick={onClose}>
            {t("editor.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={submit} disabled={!canSave}>
            {pending ? t("editor.saving") : t("editor.save")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("editor.fields.name")} hint={t("editor.fields.nameHint")} required>
          <TextInput
            value={name}
            onChange={setName}
            placeholder={t("file.namePlaceholder")}
            mono
          />
        </FormField>

        {/* The description is the skill's INTERFACE: it is what a reader (and a
            future router) uses to decide whether this skill applies at all. The
            hint says so, and says to write it as an instruction. */}
        <FormField
          label={t("editor.fields.description")}
          hint={t("editor.fields.descriptionHint")}
        >
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("editor.fields.descriptionPlaceholder")}
          />
        </FormField>

        <FormField label={t("editor.fields.type")} hint={t("editor.fields.typeHint")}>
          <SelectInput
            value={type}
            onChange={(v) => setType(v as SkillType)}
            options={TYPE_OPTIONS.map((value) => ({ value, label: t(`listItem.type.${value}`) }))}
          />
        </FormField>

        <FormField label={t("editor.fields.body")} hint={t("editor.fields.bodyHint")} required>
          <Textarea value={body} onChange={setBody} rows={BODY_ROWS} mono />
        </FormField>
      </div>
    </Modal>
  );
}
