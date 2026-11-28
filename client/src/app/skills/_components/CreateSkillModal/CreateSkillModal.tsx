/* CreateSkillModal — "Add Skill → Create new": name, type, description.
   Creates v1 with an empty body and opens the skill's Config tab to write it. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, TextInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "@/components/skill-badges";
import { useCreateSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";


export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("rubric");
  const canSubmit = name.trim().length > 0 && description.trim().length > 0 && !create.isPending;

  const submit = async () => {
    const skill = await create.mutateAsync({ name: name.trim(), description: description.trim(), type, body: "" });
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  return (
    <Modal
      width={560}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={!canSubmit}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <FormField label={t("config.name")} hint={t("config.nameHint")} required>
          <TextInput value={name} onChange={setName} placeholder={t("create.namePlaceholder")} mono />
        </FormField>
        <FormField label={t("config.type")}>
          <SelectInput
            value={type}
            onChange={(v) => setType(v as SkillType)}
            options={SKILL_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }))}
          />
        </FormField>
        <FormField label={t("config.description")} hint={t("config.descriptionHint")} required>
          <TextInput value={description} onChange={setDescription} placeholder={t("create.descriptionPlaceholder")} />
        </FormField>
        {create.error instanceof ApiError && (
          <div role="alert" style={{ fontSize: 13, color: "var(--crit)" }}>
            {create.error.message}
          </div>
        )}
      </div>
    </Modal>
  );
}
